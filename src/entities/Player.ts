import { Container, Sprite } from "pixi.js";
import { PLAYER } from "../config/player";
import type { WeaponDef } from "../config/weapons";
import type { Input } from "../core/Input";
import type { Arena } from "../world/Arena";
import type { Camera } from "../fx/Camera";
import type { GameTextures } from "../fx/textures";

const MOVE_SPEED = 151;
const ACCEL = 14;
/** How far the gun jolts back along the barrel on a shot, in px. */
const GUN_KICK = 4;
const HURT_FLASH_SECONDS = 0.09;
/**
 * Where things sit in the player sprite, as fractions of its size. The anchor is the torso
 * centre the body rotates around; the hand point is where the two hands meet, and the
 * equipped weapon's grip is pinned there.
 */
const SPRITE = {
  anchor: { x: 0.5, y: 0.5 },
  hand: { x: 0.86, y: 0.52 },
} as const;

export class Player {
  readonly view = new Container();
  readonly radius = 14;
  health = PLAYER.maxHealth;
  /** Seconds of immunity left after a hit. */
  private invuln = 0;
  private flash = 0;
  private sinceHit = Infinity;
  /** Power-up multipliers, set each frame by the game. */
  speedScale = 1;
  magnetRadiusScale = 1;
  magnetPullScale = 1;
  x: number;
  y: number;
  private vx = 0;
  private vy = 0;
  /** Recoil velocity, kept apart from movement so it kicks and settles instead of becoming drift. */
  private rx = 0;
  private ry = 0;
  /** Facing angle in radians, toward the pointer. */
  aim = 0;
  private gunKick = 0;
  /** Torso sprite; power-up visuals copy its texture and anchor. */
  readonly body: Sprite;
  private readonly gun = new Sprite();
  /** Hand point offset from the torso centre in sprite-local px, before rotation. */
  private readonly handX: number;
  private readonly handY: number;
  /** Muzzle and ejection port offsets from the torso centre in sprite-local px, before rotation. Set by equip. */
  private muzzleX = 0;
  private muzzleY = 0;
  private ejectX = 0;
  private ejectY = 0;

  constructor(
    private readonly tex: GameTextures,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    this.body = new Sprite(tex.player);
    this.body.anchor.set(SPRITE.anchor.x, SPRITE.anchor.y);
    this.handX = (SPRITE.hand.x - SPRITE.anchor.x) * tex.player.width;
    this.handY = (SPRITE.hand.y - SPRITE.anchor.y) * tex.player.height;
    this.gun.position.set(this.handX, this.handY);
    this.view.addChild(this.body, this.gun);
    this.view.position.set(x, y);
  }

  /** Swap the held weapon art. The sprite's grip sits on the hand point; the muzzle follows from its size. */
  equip(def: WeaponDef): void {
    const { grip, muzzle, eject } = def.sprite;
    const texture = this.tex.weapons[def.id];
    this.gun.texture = texture;
    this.gun.anchor.set(grip.x, grip.y);
    this.muzzleX = this.handX + (muzzle.x - grip.x) * texture.width;
    this.muzzleY = this.handY + (muzzle.y - grip.y) * texture.height;
    this.ejectX = this.handX + (eject.x - grip.x) * texture.width;
    this.ejectY = this.handY + (eject.y - grip.y) * texture.height;
  }

  /** World position of the gun barrel tip, where shots and flashes originate. */
  muzzle(): { x: number; y: number } {
    return this.gunPoint(this.muzzleX, this.muzzleY);
  }

  /** World position of the ejection port, where casings leave the gun. */
  ejectPort(): { x: number; y: number } {
    return this.gunPoint(this.ejectX, this.ejectY);
  }

  /** A gun-local point to world space, following the kick and the aim. */
  private gunPoint(localX: number, localY: number): { x: number; y: number } {
    const d = localX - this.gunKick;
    const cos = Math.cos(this.aim);
    const sin = Math.sin(this.aim);
    return {
      x: this.x + cos * d - sin * localY,
      y: this.y + sin * d + cos * localY,
    };
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get moveSpeed(): number {
    return MOVE_SPEED * this.speedScale;
  }

  /** How fast he is actually moving right now: the run plus any recoil kickback. */
  get speed(): number {
    return Math.hypot(this.vx + this.rx, this.vy + this.ry);
  }

  /** Take a hit. Returns false while immune or already down, so feedback only fires on real hits. */
  hurt(amount: number): boolean {
    if (this.invuln > 0 || !this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.invuln = PLAYER.invulnSeconds;
    this.flash = HURT_FLASH_SECONDS;
    this.sinceHit = 0;
    return true;
  }

  heal(amount: number): void {
    if (this.alive)
      this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  /** Shove the player opposite the shot and jolt the gun back along the barrel. */
  recoil(
    dirX: number,
    dirY: number,
    strength: number,
    gunKick = GUN_KICK,
  ): void {
    this.rx -= dirX * strength;
    this.ry -= dirY * strength;
    this.gunKick = gunKick;
  }

  update(dt: number, input: Input, camera: Camera, arena: Arena): void {
    this.invuln -= dt;
    this.sinceHit += dt;
    if (PLAYER.regenPerSecond > 0 && this.sinceHit > PLAYER.regenDelay)
      this.heal(PLAYER.regenPerSecond * dt);
    if (this.flash > 0) {
      this.flash -= dt;
      this.body.texture =
        this.flash > 0 ? this.tex.playerFlash : this.tex.player;
    }

    const axis = input.moveAxis();
    const blend = 1 - Math.exp(-dt * ACCEL);
    const speed = this.moveSpeed;
    this.vx += (axis.x * speed - this.vx) * blend;
    this.vy += (axis.y * speed - this.vy) * blend;
    this.x += (this.vx + this.rx) * dt;
    this.y += (this.vy + this.ry) * dt;
    const settle = Math.exp(-dt * PLAYER.recoilGrip);
    this.rx *= settle;
    this.ry *= settle;

    const b = arena.bounds;
    this.x = Math.min(
      b.maxX - this.radius,
      Math.max(b.minX + this.radius, this.x),
    );
    this.y = Math.min(
      b.maxY - this.radius,
      Math.max(b.minY + this.radius, this.y),
    );

    const target = camera.screenToWorld(input.pointer.x, input.pointer.y);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    // The barrel sits beside the torso, so rotate a touch less than the centre-to-cursor angle
    // to make the barrel line itself pass through the cursor.
    const dist = Math.hypot(dx, dy);
    const side = Math.abs(this.muzzleY);
    const sideways =
      dist > side ? Math.asin(side / dist) * Math.sign(this.muzzleY) : 0;
    this.aim = Math.atan2(dy, dx) - sideways;

    this.gunKick *= Math.exp(-dt * 18);
    this.gun.x = this.handX - this.gunKick;
    this.view.position.set(this.x, this.y);
    this.view.rotation = this.aim;
  }
}

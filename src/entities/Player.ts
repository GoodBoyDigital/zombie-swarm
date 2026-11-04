import { Container, Sprite } from "pixi.js";
import type { Input } from "../core/Input";
import type { Arena } from "../world/Arena";
import type { Camera } from "../fx/Camera";
import type { GameTextures } from "../fx/textures";

const MOVE_SPEED = 270;
const ACCEL = 14;
const RECOIL_DECAY = 22;
/** How far the whole body jolts back along the barrel on a shot, in px. */
const GUN_KICK = 4;
/**
 * Where things sit in the player sprite, as fractions of its size. The anchor is the torso
 * centre the body rotates around; the muzzle is the rifle's barrel tip.
 */
const SPRITE = {
  anchor: { x: 0.21, y: 0.42 },
  muzzle: { x: 1, y: 0.54 },
} as const;

export class Player {
  readonly view = new Container();
  readonly radius = 14;
  /** Multiplies the loot vacuum radius and pull from `PLAYER`. A magnet power-up raises it. */
  magnetScale = 1;
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
  private readonly body: Sprite;
  /** Muzzle offset from the torso centre in sprite-local px, before rotation. */
  private readonly muzzleX: number;
  private readonly muzzleY: number;

  constructor(tex: GameTextures, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.body = new Sprite(tex.player);
    this.body.anchor.set(SPRITE.anchor.x, SPRITE.anchor.y);
    this.muzzleX = (SPRITE.muzzle.x - SPRITE.anchor.x) * tex.player.width;
    this.muzzleY = (SPRITE.muzzle.y - SPRITE.anchor.y) * tex.player.height;
    this.view.addChild(this.body);
    this.view.position.set(x, y);
  }

  /** World position of the gun barrel tip, where shots and flashes originate. */
  muzzle(): { x: number; y: number } {
    const d = this.muzzleX - this.gunKick;
    const cos = Math.cos(this.aim);
    const sin = Math.sin(this.aim);
    return {
      x: this.x + cos * d - sin * this.muzzleY,
      y: this.y + sin * d + cos * this.muzzleY,
    };
  }

  /** Shove the player opposite the shot and jolt the body back along the barrel. */
  recoil(dirX: number, dirY: number, strength: number): void {
    this.rx -= dirX * strength;
    this.ry -= dirY * strength;
    this.gunKick = GUN_KICK;
  }

  update(dt: number, input: Input, camera: Camera, arena: Arena): void {
    const axis = input.moveAxis();
    const blend = 1 - Math.exp(-dt * ACCEL);
    this.vx += (axis.x * MOVE_SPEED - this.vx) * blend;
    this.vy += (axis.y * MOVE_SPEED - this.vy) * blend;
    this.x += (this.vx + this.rx) * dt;
    this.y += (this.vy + this.ry) * dt;
    const settle = Math.exp(-dt * RECOIL_DECAY);
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
    this.body.x = -this.gunKick;
    this.view.position.set(this.x, this.y);
    this.view.rotation = this.aim;
  }
}

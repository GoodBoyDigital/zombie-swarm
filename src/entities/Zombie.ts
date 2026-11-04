import { Sprite, type Texture } from "pixi.js";
import {
  KNOCKBACK_DRAG,
  ZOMBIE_SPRITE_ANCHOR,
  ZOMBIE_SPRITE_RADIUS,
  type ZombieDef,
} from "../config/zombies";
import { rand } from "../core/random";
import type { Gate } from "../world/Arena";

const HIT_FLASH_SECONDS = 0.07;

/** One pooled zombie. Position lives on the object; the sprite mirrors it once per frame. */
export class Zombie {
  readonly sprite = new Sprite();
  def!: ZombieDef;
  x = 0;
  y = 0;
  health = 0;
  speed = 0;
  /** Knockback velocity, decays quickly. */
  kx = 0;
  ky = 0;
  facing = 0;
  tint = 0xffffff;
  private flash = 0;
  gate!: Gate;
  /** Set once the zombie has fully crossed its gate; from then on walls contain it. */
  entered = false;
  /** Killed this frame. Ignored by raycasts and crowding until the horde releases it. */
  dead = false;

  constructor(
    private readonly texture: Texture,
    private readonly flashTexture: Texture,
  ) {
    this.sprite.texture = texture;
    this.sprite.anchor.set(ZOMBIE_SPRITE_ANCHOR.x, ZOMBIE_SPRITE_ANCHOR.y);
  }

  spawn(def: ZombieDef, gate: Gate): void {
    this.def = def;
    this.gate = gate;
    this.entered = false;
    this.dead = false;
    this.health = def.health;
    this.speed = def.speed + rand(-def.speedVariance, def.speedVariance);
    this.kx = 0;
    this.ky = 0;
    this.flash = 0;
    const along = rand(-gate.halfWidth, gate.halfWidth);
    const horizontal = gate.side === "top" || gate.side === "bottom";
    this.x = gate.spawn.x + (horizontal ? along : rand(-30, 30));
    this.y = gate.spawn.y + (horizontal ? rand(-30, 30) : along);
    this.facing = Math.atan2(gate.entry.y - this.y, gate.entry.x - this.x);
    this.tint = shade(def.color, rand(0.8, 1));
    this.sprite.tint = this.tint;
    this.sprite.texture = this.texture;
    this.sprite.scale.set(def.radius / ZOMBIE_SPRITE_RADIUS);
    this.sprite.visible = true;
  }

  /** Returns true if this hit killed the zombie. */
  hit(damage: number, dirX: number, dirY: number, knockback: number): boolean {
    if (this.dead) return false;
    this.health -= damage;
    const k = knockback * this.def.knockbackScale;
    this.kx += dirX * k;
    this.ky += dirY * k;
    this.flash = HIT_FLASH_SECONDS;
    this.dead = this.health <= 0;
    return this.dead;
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    playerRadius: number,
  ): void {
    const target = this.entered ? { x: playerX, y: playerY } : this.gate.entry;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const desired = Math.atan2(dy, dx);
    // Turn toward the target rather than snapping, so direction changes read as lumbering.
    let turn = desired - this.facing;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.facing += turn * Math.min(1, dt * 8);

    // Slow to a stop when touching the player instead of overlapping them.
    const stopAt = this.def.radius + playerRadius;
    const move = dist > stopAt ? this.speed : 0;
    this.x += (Math.cos(this.facing) * move + this.kx) * dt;
    this.y += (Math.sin(this.facing) * move + this.ky) * dt;
    const decay = Math.exp(-dt * KNOCKBACK_DRAG);
    this.kx *= decay;
    this.ky *= decay;

    if (this.flash > 0) {
      this.flash -= dt;
      const flashing = this.flash > 0;
      this.sprite.texture = flashing ? this.flashTexture : this.texture;
      this.sprite.tint = flashing ? 0xffffff : this.tint;
    }
  }

  /** Push the resolved position to the sprite. Runs after crowding and wall clamps. */
  syncSprite(): void {
    this.sprite.position.set(this.x, this.y);
    this.sprite.rotation = this.facing;
  }
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

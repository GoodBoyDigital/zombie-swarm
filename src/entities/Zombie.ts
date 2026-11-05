import { Sprite } from "pixi.js";
import { ICE } from "../config/ice";
import {
  KNOCKBACK_DRAG,
  PART_IDS,
  ZOMBIE_AI,
  type PartShape,
  type ZombieDef,
} from "../config/zombies";
import { rand } from "../core/random";
import {
  ART_SCALE,
  type GameTextures,
  type ZombieLook,
  type ZombieTextures,
} from "../fx/textures";
import type { Gate } from "../world/Arena";
import { aiDebug, ZombieBrain } from "./ZombieBrain";

const HIT_FLASH_SECONDS = 0.07;
const TWO_PI = Math.PI * 2;
/** Mean of max(0, sin φ)^0.5 over a step cycle, so the pulsed speed averages out to the def speed. */
const PULSE_MEAN = 0.3814;
/** Debug tint for wanderers: red and green pulled down so the body reads blue. */
const WANDER_TINT_FACTOR = 0.55;
/** Debug tint for chasers losing interest: blue pulled down so the green body reads lime. A tint can only darken. */
const LOSING_TINT_FACTOR = 0.35;
/** Spacing of the points tested along a shot when looking for which part it struck, world px. */
const PART_RAY_STEP = 1.5;

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
  /** Step cycle, radians. Advances with distance walked; drives the lurch, sway and squash. */
  private phase = 0;
  private stepSin = 0;
  /** Per-zombie multipliers rolled at spawn so no two of a type share a cadence, sway or size. */
  private stepScale = 1;
  private swayScale = 1;
  private sizeScale = 1;
  private shuffleScale = 1;
  /** Slow speed drift: its own phase and rate per zombie. */
  private wobblePhase = 0;
  private wobbleRate = 0;
  tint = 0xffffff;
  private wanderTint = 0xffffff;
  private losingTint = 0xffffff;
  private flash = 0;
  readonly brain = new ZombieBrain();
  /** Sprite set for the current def; the pool is shared across types so it's picked at spawn. */
  private art!: ZombieTextures;
  /** Bit per PART_IDS entry that has been shot off. */
  missing = 0;
  /** The art's look for the current missing mask. */
  private look!: ZombieLook;
  gate!: Gate;
  /** Set once the zombie has fully crossed its gate; from then on walls contain it. */
  entered = false;
  /** Killed this frame. Ignored by raycasts and crowding until the horde releases it. */
  dead = false;
  /**
   * Seconds left frozen solid in a block of ice (src/fx/Ice.ts). Frozen, it doesn't move, turn,
   * bite or get pushed, the crowd flows round it, and any hit shatters it (CombatContext.applyHit).
   */
  frozenFor = 0;

  constructor(private readonly tex: GameTextures) {}

  /** `healthScale` is the level's toughness on top of the type's health. */
  spawn(def: ZombieDef, gate: Gate, healthScale: number): void {
    this.def = def;
    this.art = this.tex.zombies[def.art.key];
    this.gate = gate;
    this.entered = false;
    this.dead = false;
    this.health = def.health * healthScale;
    this.speed = def.speed + rand(-def.speedVariance, def.speedVariance);
    this.kx = 0;
    this.ky = 0;
    this.flash = 0;
    this.frozenFor = 0;
    const along = rand(-gate.halfWidth, gate.halfWidth);
    const horizontal = gate.side === "top" || gate.side === "bottom";
    this.x = gate.spawn.x + (horizontal ? along : rand(-30, 30));
    this.y = gate.spawn.y + (horizontal ? rand(-30, 30) : along);
    this.facing = Math.atan2(gate.entry.y - this.y, gate.entry.x - this.x);
    this.phase = rand(0, TWO_PI);
    this.stepScale = jitter(ZOMBIE_AI.stepLengthJitter);
    this.swayScale = jitter(ZOMBIE_AI.swayJitter);
    this.sizeScale = jitter(ZOMBIE_AI.sizeJitter);
    this.shuffleScale = jitter(ZOMBIE_AI.shuffleJitter);
    this.wobblePhase = rand(0, TWO_PI);
    this.wobbleRate =
      TWO_PI /
      rand(ZOMBIE_AI.speedWobblePeriodMin, ZOMBIE_AI.speedWobblePeriodMax);
    this.tint = shade(def.color, rand(0.8, 1));
    this.wanderTint = blueShade(this.tint, WANDER_TINT_FACTOR);
    this.losingTint = limeShade(this.tint, LOSING_TINT_FACTOR);
    this.sprite.tint = this.tint;
    this.brain.reset(def);
    this.missing = 0;
    this.look = this.art.looks[0];
    this.sprite.texture = this.look.body;
    this.sprite.anchor.set(def.art.anchor.x, def.art.anchor.y);
    this.sprite.visible = true;
  }

  get frozen(): boolean {
    return this.frozenFor > 0;
  }

  /**
   * Freeze solid for at least `seconds`: it stops mid-stride, in a cold tint. The freezing blast's
   * shove along (dirX, dirY) is the only push it takes: the block skids on it until drag stops it.
   */
  freeze(seconds: number, dirX = 0, dirY = 0, knockback = 0): void {
    this.frozenFor = Math.max(this.frozenFor, seconds);
    const k = knockback * this.def.knockbackScale;
    this.kx = dirX * k;
    this.ky = dirY * k;
    this.flash = 0;
    this.sprite.texture = this.look.body;
    this.sprite.tint = ICE.frozenTint;
  }

  /** Frozen and hit: killed outright whatever its health, thrown along the hit for the shatter's pieces. */
  shatter(dirX: number, dirY: number, knockback: number): void {
    this.health = 0;
    this.dead = true;
    const k = knockback * this.def.knockbackScale;
    this.kx = dirX * k;
    this.ky = dirY * k;
  }

  /** Returns true if this hit killed the zombie. */
  hit(damage: number, dirX: number, dirY: number, knockback: number): boolean {
    if (this.dead) return false;
    this.health -= damage;
    this.push(dirX, dirY, knockback);
    this.flash = HIT_FLASH_SECONDS;
    this.dead = this.health <= 0;
    return this.dead;
  }

  /**
   * Which attached part a shot through (x, y) along the unit direction strikes first, as a part
   * bit index, or -1. Walks the line from an arm's length in front of the hit point to the far side
   * of the body, so arms reaching past the hit circle are caught and a shot can exit through the
   * head. Only solid pixels of the current body count, so a shot between the arms reaches the head.
   */
  partOnRay(x: number, y: number, dirX: number, dirY: number): number {
    const parts = this.def.art.parts;
    const opaque = this.look.opaque;
    if (!parts || !opaque) return -1;
    const s = this.sprite;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    const ax = s.anchor.x * s.texture.width;
    const ay = s.anchor.y * s.texture.height;
    const reach = s.texture.width * s.scale.x;
    for (let t = -reach; t <= this.def.radius * 2; t += PART_RAY_STEP) {
      const dx = x + dirX * t - s.x;
      const dy = y + dirY * t - s.y;
      // Into the sprite's own source pixels: undo rotation, scale and anchor, then ART_SCALE.
      const u = ((dx * cos + dy * sin) / s.scale.x + ax) / ART_SCALE;
      const v = ((dy * cos - dx * sin) / s.scale.y + ay) / ART_SCALE;
      const px = Math.floor(u);
      const py = Math.floor(v);
      if (px < 0 || py < 0 || px >= opaque.width || py >= opaque.height)
        continue;
      if (!opaque.solid[py * opaque.width + px]) continue;
      for (let bit = 0; bit < PART_IDS.length; bit++) {
        const part = parts[PART_IDS[bit]];
        if (part && !(this.missing & (1 << bit)) && inside(part.body, u, v))
          return bit;
      }
    }
    return -1;
  }

  /** Killed outright, whatever health was left: it lost its head. */
  drop(): void {
    this.health = 0;
    this.dead = true;
  }

  /** Take a part off: from now on the body, flash and corpse are drawn without it. */
  sever(bit: number): void {
    this.missing |= 1 << bit;
    this.look = this.art.looks[this.missing];
    this.sprite.texture = this.flash > 0 ? this.look.flash : this.look.body;
  }

  /** Shove along a unit direction without hurting, scaled by the type's knockbackScale. */
  push(dirX: number, dirY: number, knockback: number): void {
    if (this.frozenFor > 0) return;
    const k = knockback * this.def.knockbackScale;
    this.kx += dirX * k;
    this.ky += dirY * k;
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    playerRadius: number,
    hunting: boolean,
    everyoneHunts: boolean,
  ): void {
    if (this.frozenFor > 0) {
      this.frozenFor = Math.max(0, this.frozenFor - dt);
      this.coast(dt);
      if (this.frozenFor === 0) this.sprite.tint = this.debugTint();
      return;
    }
    this.wobblePhase += this.wobbleRate * dt;
    const move =
      this.brain.steer(
        dt,
        this,
        playerX,
        playerY,
        playerRadius,
        hunting,
        everyoneHunts,
      ) *
      (1 + ZOMBIE_AI.speedWobble * Math.sin(this.wobblePhase));
    // Lurching gait: push forward on each step, nearly stall between. The pulse averages to 1 over a step.
    const ai = this.def.ai;
    if (move > 0)
      this.phase +=
        (move / ((ai.stepLength ?? ZOMBIE_AI.stepLength) * this.stepScale)) *
        TWO_PI *
        dt;
    this.stepSin = Math.sin(this.phase);
    const pulse = this.stepSin > 0 ? Math.sqrt(this.stepSin) : 0;
    const shuffle = Math.min(
      1,
      (ai.shuffle ?? ZOMBIE_AI.shuffle) * this.shuffleScale,
    );
    const gait = 1 + shuffle * (pulse / PULSE_MEAN - 1);
    this.x += Math.cos(this.facing) * move * gait * dt;
    this.y += Math.sin(this.facing) * move * gait * dt;
    this.coast(dt);

    if (this.flash > 0) {
      this.flash -= dt;
      this.sprite.texture = this.flash > 0 ? this.look.flash : this.look.body;
    }
    const flashing = this.flash > 0;
    const tint = flashing ? 0xffffff : this.debugTint();
    if (this.sprite.tint !== tint) this.sprite.tint = tint;
  }

  /** Carry on along the knockback velocity, which drag bleeds away. */
  private coast(dt: number): void {
    this.x += this.kx * dt;
    this.y += this.ky * dt;
    const decay = Math.exp(-dt * KNOCKBACK_DRAG);
    this.kx *= decay;
    this.ky *= decay;
  }

  private debugTint(): number {
    if (!aiDebug.enabled) return this.tint;
    if (this.brain.wandering) return this.wanderTint;
    return this.brain.losingInterest ? this.losingTint : this.tint;
  }

  /** Push the resolved position to the sprite. Runs after crowding and wall clamps. */
  syncSprite(): void {
    const ai = this.def.ai;
    this.sprite.position.set(this.x, this.y);
    this.sprite.rotation =
      this.facing + this.stepSin * (ai.sway ?? ZOMBIE_AI.sway) * this.swayScale;
    const base = (this.def.radius / this.def.art.radius) * this.sizeScale;
    const squash = this.stepSin * (ai.squash ?? ZOMBIE_AI.squash);
    this.sprite.scale.set(base * (1 + squash), base * (1 - squash));
  }
}

function inside(shape: PartShape, x: number, y: number): boolean {
  if ("circle" in shape) {
    const [cx, cy, r] = shape.circle;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }
  // Even-odd crossing test.
  const p = shape.poly;
  let hit = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1];
    const yj = p[j + 1];
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i])
      hit = !hit;
  }
  return hit;
}

const jitter = (amount: number): number => 1 + rand(-amount, amount);

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function blueShade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  return (r << 16) | (g << 8) | (color & 0xff);
}

function limeShade(color: number, factor: number): number {
  const b = Math.round((color & 0xff) * factor);
  return (color & 0xffff00) | b;
}

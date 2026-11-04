import { Sprite } from "pixi.js";
import { KNOCKBACK_DRAG, ZOMBIE_AI, type ZombieDef } from "../config/zombies";
import { rand } from "../core/random";
import type { GameTextures, ZombieTextures } from "../fx/textures";
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
  gate!: Gate;
  /** Set once the zombie has fully crossed its gate; from then on walls contain it. */
  entered = false;
  /** Killed this frame. Ignored by raycasts and crowding until the horde releases it. */
  dead = false;

  constructor(private readonly tex: GameTextures) {}

  spawn(def: ZombieDef, gate: Gate): void {
    this.def = def;
    this.art = this.tex.zombies[def.art.key];
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
    this.sprite.texture = this.art.body;
    this.sprite.anchor.set(def.art.anchor.x, def.art.anchor.y);
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
    this.wobblePhase += this.wobbleRate * dt;
    const move =
      this.brain.steer(dt, this, playerX, playerY, playerRadius) *
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
    this.x += (Math.cos(this.facing) * move * gait + this.kx) * dt;
    this.y += (Math.sin(this.facing) * move * gait + this.ky) * dt;
    const decay = Math.exp(-dt * KNOCKBACK_DRAG);
    this.kx *= decay;
    this.ky *= decay;

    if (this.flash > 0) {
      this.flash -= dt;
      this.sprite.texture = this.flash > 0 ? this.art.flash : this.art.body;
    }
    const flashing = this.flash > 0;
    const tint = flashing ? 0xffffff : this.debugTint();
    if (this.sprite.tint !== tint) this.sprite.tint = tint;
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

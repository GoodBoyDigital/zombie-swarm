import type { Container, Rectangle } from "pixi.js";
import type { Audio } from "../audio/Audio";
import { CombatContext } from "../combat/CombatContext";
import type { Weapon } from "../combat/Weapon";
import type { Modifiers, PowerupDef } from "../config/powerups";
import type { Horde } from "../entities/Horde";
import type { Player } from "../entities/Player";
import type { Camera } from "../fx/Camera";
import type { Casings } from "../fx/Casings";
import type { ColorGrade } from "../fx/ColorGrade";
import type { Effects } from "../fx/Effects";
import type { FloorCanvas } from "../world/FloorCanvas";

/**
 * What effect handlers get to work with. It is a CombatContext, so `explode(ctx, ...)` and
 * `ctx.applyHit` work directly; power-up damage ignores double damage (damageScale stays 1).
 */
export class PowerupContext extends CombatContext {
  /** Product of every running stat multiplier this frame. Reset to 1 before effects update; read after. */
  readonly modifiers: Modifiers = noModifiers();
  /** The world clock rate (modifiers.timeScale) as of last frame, for effects that live in the world, like the airstrike plane. */
  timeScale = 1;

  constructor(
    horde: Horde,
    fx: Effects,
    floor: FloorCanvas,
    camera: Camera,
    audio: Audio,
    casings: Casings,
    readonly player: Player,
    readonly weapon: Weapon,
    /** World-space layer for effect visuals (bubbles, domes, strike lines), drawn over the horde and orbs. */
    readonly world: Container,
    /** World-space layer over the explosions, for things in the air (planes and falling bombs). */
    readonly sky: Container,
    /** World-space layer on the floor, under the player and the horde, for auras and ground marks. */
    readonly ground: Container,
    /** Screen-space layer over the world and under the HUD, for flashes and overlays. */
    readonly screen: Container,
    /** Live screen size in CSS px, for anything sized to the screen layer. */
    readonly screenRect: Rectangle,
    /** Full-screen colour grade; add a look each frame while it should show. */
    readonly grade: ColorGrade,
  ) {
    super(horde, fx, floor, camera, audio, casings);
  }

  resetModifiers(): void {
    Object.assign(this.modifiers, noModifiers());
  }
}

const noModifiers = (): Modifiers => ({
  moveSpeed: 1,
  fireInterval: 1,
  damage: 1,
  reload: 1,
  shotPower: 1,
  magnetRadius: 1,
  magnetPull: 1,
  spread: 1,
  timeScale: 1,
  playerTimeScale: 1,
});

/** One pickup in progress. */
export interface ActivePowerup<S = unknown> {
  readonly def: PowerupDef;
  /** Orb position at collection, retained even after its pooled view is released. */
  readonly origin: { x: number; y: number };
  /**
   * Seconds left; `end` runs when it reaches 0. Timed: `def.seconds`, refreshed by another pickup of
   * the same id. Instant: 0, so it ends straight after `start` unless start sets it to keep
   * running for its visuals (a screen flash fading, a plane crossing overhead).
   */
  left: number;
  /** Seconds since pickup. */
  age: number;
  /** Whatever the effect keeps between calls; set it in `start`. */
  state: S;
}

/**
 * A power-up's behaviour. All three hooks are optional. Timed: start on the first pickup, update
 * every frame while active, end on expiry. Instant: start on every pickup (each its own instance).
 */
export interface PowerupEffect<D extends PowerupDef = PowerupDef, S = unknown> {
  start?(ctx: PowerupContext, def: D, active: ActivePowerup<S>): void;
  update?(
    ctx: PowerupContext,
    def: D,
    dt: number,
    active: ActivePowerup<S>,
  ): void;
  end?(ctx: PowerupContext, def: D, active: ActivePowerup<S>): void;
}

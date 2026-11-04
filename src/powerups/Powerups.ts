import { POWERUP_CATEGORIES, type PowerupDef } from "../config/powerups";
import type {
  ActivePowerup,
  PowerupContext,
  PowerupEffect,
} from "./PowerupContext";
import { POWERUP_EFFECTS } from "./registry";

/** The registry is keyed so each handler gets its own def member; the runner only ever passes a def to its own handler. */
const effectOf = (def: PowerupDef) =>
  POWERUP_EFFECTS[def.effect] as PowerupEffect;

/**
 * Runs every pickup through its effect handler. Timed ones count down and refresh on a repeat
 * pickup; instant ones start and end on the spot unless their start keeps them alive for a while.
 */
export class Powerups {
  /** In pickup order, so HUD pills don't jump around. Instant ones only while their start keeps them running. */
  readonly active: ActivePowerup[] = [];

  constructor(readonly ctx: PowerupContext) {}

  apply(def: PowerupDef): void {
    const ctx = this.ctx;
    ctx.audio.play(def.sound ?? POWERUP_CATEGORIES[def.category].sound, {
      volume: 0.7,
    });
    if (def.mode === "timed") {
      const current = this.active.find((a) => a.def.id === def.id);
      if (current) {
        current.left = def.seconds;
        return;
      }
    }
    const active: ActivePowerup = {
      def,
      left: def.mode === "timed" ? def.seconds : 0,
      age: 0,
      state: undefined,
    };
    const effect = effectOf(def);
    effect.start?.(ctx, def, active);
    if (active.left > 0) this.active.push(active);
    else effect.end?.(ctx, def, active);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    ctx.resetModifiers();
    for (let i = 0; i < this.active.length; i++) {
      const a = this.active[i];
      const effect = effectOf(a.def);
      a.age += dt;
      a.left -= dt;
      effect.update?.(ctx, a.def, dt, a);
      if (a.left > 0) continue;
      effect.end?.(ctx, a.def, a);
      this.active.splice(i--, 1);
      if (a.def.mode === "timed") ctx.audio.play("powerupEnd", { volume: 0.5 });
    }
  }
}

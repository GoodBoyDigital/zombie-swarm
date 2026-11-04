import type { EffectDef, Modifiers } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";

/** Timed stat multipliers (magnet, rapid fire, double damage, speed). Different ones stack by multiplying. */
export const modifiers: PowerupEffect<EffectDef<"modifiers">> = {
  update(ctx, def) {
    const mods: Partial<Modifiers> = def.modifiers;
    for (const key of Object.keys(mods) as (keyof Modifiers)[])
      ctx.modifiers[key] *= mods[key] ?? 1;
  },
};

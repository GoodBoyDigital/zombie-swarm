import type { Modifiers } from "../../config/powerups";
import type { PowerupContext } from "../PowerupContext";

/** Fold a timed power-up's stat multipliers into this frame's. Different ones stack by multiplying. */
export function applyModifiers(
  ctx: PowerupContext,
  mods: Partial<Modifiers>,
): void {
  for (const key of Object.keys(mods) as (keyof Modifiers)[])
    ctx.modifiers[key] *= mods[key] ?? 1;
}

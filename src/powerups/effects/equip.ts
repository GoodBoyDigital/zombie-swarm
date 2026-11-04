import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";

/** Weapon pickup: swap to that gun with a full magazine. */
export const equip: PowerupEffect<EffectDef<"equip">> = {
  start(ctx, def) {
    ctx.weapon.equip(def.weapon);
  },
};

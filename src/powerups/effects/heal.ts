import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";

export const heal: PowerupEffect<EffectDef<"heal">> = {
  start(ctx, def) {
    ctx.player.heal(def.heal);
  },
};

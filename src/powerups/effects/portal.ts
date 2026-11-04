import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";
import { closeDome, type DomeState, openDome, updateDome } from "./dome";

/**
 * A larger dome that opens where the player stands and stays put. Zombies crowd its edge; he can shoot
 * out through it, and walk out (losing the cover) and back in.
 */
export const portal: PowerupEffect<EffectDef<"portal">, DomeState> = {
  start(ctx, def, active) {
    active.state = openDome(ctx, def, ctx.player.x, ctx.player.y);
  },
  update(_ctx, def, dt, active) {
    updateDome(def, dt, active);
  },
  end(ctx, _def, active) {
    closeDome(ctx, active.state);
  },
};

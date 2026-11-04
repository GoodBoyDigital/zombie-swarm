import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";
import { closeDome, type DomeState, openDome, updateDome } from "./dome";

/** A small electric bubble that moves with the player. Zombies can't get in, and bounce off. */
export const shield: PowerupEffect<EffectDef<"shield">, DomeState> = {
  start(ctx, def, active) {
    const p = ctx.player;
    active.state = openDome(ctx, def, p.x, p.y, (z, nx, ny) => {
      // Shove only once it has stopped flying off, so each zombie bounces rather than being held away.
      if (z.kx * nx + z.ky * ny > def.shove * 0.3) return false;
      z.push(nx, ny, def.shove);
      return true;
    });
    active.state.dome.follow = p;
  },
  update(ctx, def, dt, active) {
    active.state.zone.x = ctx.player.x;
    active.state.zone.y = ctx.player.y;
    updateDome(def, dt, active);
  },
  end(ctx, _def, active) {
    closeDome(ctx, active.state);
  },
};

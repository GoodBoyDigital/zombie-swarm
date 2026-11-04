import { Graphics } from "pixi.js";
import { explode } from "../../combat/explosion";
import { EXPLOSIONS } from "../../config/explosions";
import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";

/** One huge blast centred on the player, and the screen whites out for a moment. */
export const nuke: PowerupEffect<EffectDef<"nuke">, Graphics> = {
  start(ctx, def, active) {
    const p = ctx.player;
    explode(ctx, p.x, p.y, EXPLOSIONS[def.explosion]);
    const { width, height } = ctx.screenRect;
    active.state = new Graphics().rect(0, 0, width, height).fill(0xffffff);
    ctx.screen.addChild(active.state);
    // Instant, but it stays active while the flash fades.
    active.left = def.screenFlashSeconds;
    nuke.update?.(ctx, def, 0, active);
  },
  update(_ctx, def, _dt, active) {
    const t = Math.max(0, active.left / def.screenFlashSeconds);
    active.state.alpha = def.screenFlash * t * t;
  },
  end(_ctx, _def, active) {
    active.state.destroy();
  },
};

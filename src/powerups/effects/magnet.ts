import { Graphics } from "pixi.js";
import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";
import { applyModifiers } from "./modifiers";

/** Where the ripples start, px from the player: a tight halo, not the real pull radius. */
const RIPPLE_RADIUS = 60;
/** Ripples travelling inward to the player at once, and seconds for one to cross. */
const RIPPLES = 3;
const RIPPLE_SECONDS = 0.9;

/**
 * Magnet: bigger, stronger loot pull, shown as rings rippling in toward the player like something
 * being drawn in. Incoming loot crackles with lightning (Loot).
 */
export const magnet: PowerupEffect<EffectDef<"magnet">, Graphics> = {
  start(ctx, _def, active) {
    const g = new Graphics();
    g.blendMode = "add";
    ctx.ground.addChild(g);
    active.state = g;
  },
  update(ctx, def, _dt, active) {
    applyModifiers(ctx, def.modifiers);
    const g = active.state.clear();
    const inner = ctx.player.radius;
    for (let i = 0; i < RIPPLES; i++) {
      const t = (active.age / RIPPLE_SECONDS + i / RIPPLES) % 1;
      // Ease in so ripples speed up as they near the player.
      const r = RIPPLE_RADIUS - (RIPPLE_RADIUS - inner) * t * t;
      g.circle(0, 0, r).stroke({
        width: 2.5,
        color: def.ringColor,
        alpha: 0.6 * Math.sin(t * Math.PI),
      });
    }
    g.position.set(ctx.player.x, ctx.player.y);
    g.alpha = Math.min(1, active.left);
  },
  end(_ctx, _def, active) {
    active.state.destroy();
  },
};

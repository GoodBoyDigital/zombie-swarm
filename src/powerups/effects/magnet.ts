import { Graphics } from "pixi.js";
import type { EffectDef } from "../../config/powerups";
import { PLAYER } from "../../config/player";
import type { PowerupEffect } from "../PowerupContext";
import { applyModifiers } from "./modifiers";

/** Dashes around the ring, which turns slowly. */
const DASHES = 24;
const SPIN = 0.08;
/** Ripples travelling inward from the ring to the player at once, and seconds for one to cross. */
const RIPPLES = 3;
const RIPPLE_SECONDS = 1.1;

/**
 * Magnet: bigger, stronger loot pull, shown as a dashed ring on the ground at the pull radius with
 * ripples sweeping in toward the player, so you can see what it reaches and which way it pulls.
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
    const g = active.state;
    const color = def.ringColor;
    const r = PLAYER.magnetRadius * (def.modifiers.magnetRadius ?? 1);
    const inner = ctx.player.radius;
    const spin = active.age * SPIN * Math.PI * 2;
    g.clear().circle(0, 0, r).fill({ color, alpha: 0.035 });
    for (let i = 0; i < DASHES; i++) {
      const a = spin + (i / DASHES) * Math.PI * 2;
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        .arc(0, 0, r, a, a + (Math.PI / DASHES) * 1.1)
        .stroke({
          width: 3,
          color,
          alpha: 0.7,
          cap: "round",
        });
    }
    for (let i = 0; i < RIPPLES; i++) {
      const t = (active.age / RIPPLE_SECONDS + i / RIPPLES) % 1;
      // Ease in so ripples speed up as they near the player, like something being drawn in.
      const rr = r - (r - inner) * t * t;
      g.circle(0, 0, rr).stroke({
        width: 2,
        color,
        alpha: 0.45 * Math.sin(t * Math.PI),
      });
    }
    g.position.set(ctx.player.x, ctx.player.y);
    g.alpha = Math.min(1, active.left);
  },
  end(_ctx, _def, active) {
    active.state.destroy();
  },
};

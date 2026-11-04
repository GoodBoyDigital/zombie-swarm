import { Graphics } from "pixi.js";
import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";
import { applyModifiers } from "./modifiers";

/** Spokes in the aura's ring; each is a short curved blade, so the spin reads at a glance. */
const BLADES = 6;
const PULSE_HZ = 3;

/**
 * Power mode: faster fire, faster reloads, harder hits and hotter tracers (all modifiers), plus a
 * spinning aura on the ground under the player so it's obvious he's powered up.
 */
export const power: PowerupEffect<EffectDef<"power">, Graphics> = {
  start(ctx, def, active) {
    const g = new Graphics();
    const r = def.auraRadius;
    g.circle(0, 0, r).fill({ color: def.auraColor, alpha: 0.12 });
    g.circle(0, 0, r).stroke({ width: 3, color: def.auraColor, alpha: 0.85 });
    g.circle(0, 0, r * 0.62).stroke({
      width: 2,
      color: def.auraColor,
      alpha: 0.5,
    });
    for (let i = 0; i < BLADES; i++) {
      const a = (i / BLADES) * Math.PI * 2;
      g.arc(0, 0, r * 0.82, a, a + Math.PI / (BLADES * 0.9)).stroke({
        width: 4,
        color: 0xffffff,
        alpha: 0.75,
        cap: "round",
      });
    }
    g.blendMode = "add";
    ctx.ground.addChild(g);
    active.state = g;
  },
  update(ctx, def, dt, active) {
    applyModifiers(ctx, def.modifiers);
    const g = active.state;
    g.position.set(ctx.player.x, ctx.player.y);
    g.rotation += def.auraSpin * Math.PI * 2 * dt;
    const pulse = 1 + 0.06 * Math.sin(active.age * PULSE_HZ * Math.PI * 2);
    g.scale.set(pulse);
    // Fade out over the last second so the end of the effect is readable.
    g.alpha = Math.min(1, active.left);
  },
  end(_ctx, _def, active) {
    active.state.destroy();
  },
};

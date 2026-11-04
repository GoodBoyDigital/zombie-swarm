import { Container, Sprite } from "pixi.js";
import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";
import { applyModifiers } from "./modifiers";

/** Seconds between afterimages, and how long each takes to fade. */
const GHOST_INTERVAL = 0.04;
const GHOST_SECONDS = 0.4;
const GHOST_ALPHA = 0.5;
/** Below this speed, px/s, he's standing still and leaves no trail. */
const MIN_SPEED = 40;

interface SpeedState {
  layer: Container;
  ghosts: Sprite[];
  pool: Sprite[];
  timer: number;
}

/**
 * Speed: faster movement, shown as a trail of glowing afterimages of the player that fade behind
 * him as he runs.
 */
export const speed: PowerupEffect<EffectDef<"speed">, SpeedState> = {
  start(ctx, _def, active) {
    const layer = new Container();
    ctx.ground.addChild(layer);
    active.state = { layer, ghosts: [], pool: [], timer: 0 };
  },
  update(ctx, def, dt, active) {
    applyModifiers(ctx, def.modifiers);
    const s = active.state;
    const p = ctx.player;
    s.timer -= dt;
    if (s.timer <= 0 && p.speed > MIN_SPEED) {
      s.timer = GHOST_INTERVAL;
      const ghost = s.pool.pop() ?? new Sprite({ anchor: 0.5, blendMode: "add" });
      ghost.texture = p.body.texture;
      ghost.anchor.copyFrom(p.body.anchor);
      ghost.tint = def.trailColor;
      ghost.position.set(p.x, p.y);
      ghost.rotation = p.aim;
      ghost.alpha = GHOST_ALPHA;
      s.layer.addChild(ghost);
      s.ghosts.push(ghost);
    }
    const fade = (GHOST_ALPHA / GHOST_SECONDS) * dt;
    for (let i = s.ghosts.length - 1; i >= 0; i--) {
      const ghost = s.ghosts[i];
      ghost.alpha -= fade;
      if (ghost.alpha > 0) continue;
      s.layer.removeChild(ghost);
      s.ghosts[i] = s.ghosts[s.ghosts.length - 1];
      s.ghosts.pop();
      s.pool.push(ghost);
    }
    s.layer.alpha = Math.min(1, active.left);
  },
  end(_ctx, _def, active) {
    active.state.layer.destroy({ children: true });
  },
};

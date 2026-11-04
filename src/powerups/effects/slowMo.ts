import type { EffectDef } from "../../config/powerups";
import type { PowerupEffect } from "../PowerupContext";

/**
 * Slow-mo: the world drops to a fraction of its speed and the player slows by less, so he carves
 * through a crowd wading in treacle. Sound pitches down, and the world goes black and white around
 * him while he stays in colour. All of it eases in on pickup and back out as it runs out.
 */
export const slowMo: PowerupEffect<EffectDef<"slowMo">> = {
  update(ctx, def, _dt, active) {
    const ease = def.easeSeconds;
    const t = Math.min(1, active.age / ease, Math.max(0, active.left) / ease);
    const k = t * t * (3 - 2 * t);
    ctx.modifiers.timeScale *= 1 + (def.timeScale - 1) * k;
    ctx.modifiers.playerTimeScale *= 1 + (def.playerTimeScale - 1) * k;
    ctx.grade.add(def.grade, k, true);
    ctx.audio.setRate(1 + (def.sfxRate - 1) * k, 1 + (def.musicRate - 1) * k);
  },
  end(ctx) {
    ctx.audio.setRate(1, 1);
  },
};

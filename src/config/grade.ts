import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";

/**
 * One look for the full-screen colour grade (src/fx/ColorGrade.ts). Sources blend toward it by a
 * weight each frame, and every active look is composed into a single pass.
 */
export interface GradeDef {
  /** 0 = black and white, 1 = as drawn. */
  saturation: number;
  /** Around mid grey; 1 = as drawn. */
  contrast: number;
  brightness: number;
  /** Per-channel multiplier applied last. */
  tint: { r: number; g: number; b: number };
}

export const GRADES = {
  /** Low health: a red push that throbs with the vignette. The player is graded too. */
  lowHealth: {
    saturation: 0.75,
    contrast: 1.05,
    brightness: 0.95,
    tint: { r: 1.2, g: 0.82, b: 0.8 },
  },
} satisfies Record<string, GradeDef>;

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { GRADES });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

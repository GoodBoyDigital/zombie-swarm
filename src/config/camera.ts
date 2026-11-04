import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/** Follow camera. All distances are world pixels. */
export const CAMERA = {
  /** How much of the arena is visible top to bottom. The arena is 720 tall, so this zooms in. */
  viewHeight: 540,
  /** How quickly the camera catches up with the player, per second. Higher = tighter. */
  followRate: 5,
  /**
   * How far past the arena edge the camera may go: enough to show the inner edge of the wall so you
   * know you're boxed in, with darkness beyond. Also keeps a cornered player clear of the screen edge.
   */
  edgeReveal: 40,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { CAMERA });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

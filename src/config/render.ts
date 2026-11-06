import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/**
 * How many pixels the game draws. The canvas is always CSS-sized to the window; these only cap its
 * backing store, and the browser scales that up to fit. Applied by src/core/renderFit.ts.
 */
export const RENDER = {
  /** Most pixels drawn per CSS px. Phones report 3, which costs a lot of fill rate for little you can see. */
  maxResolution: 2,
  /**
   * The backing store is never wider or taller than this, in device px: past it the resolution drops
   * so the canvas still fits. This is what reins in a big desktop monitor.
   */
  maxPixelWidth: 2400,
  maxPixelHeight: 2400,
  /**
   * MSAA on the back buffer, read once at startup. Off on phones and tablets: the sprites are baked
   * with their own soft edges, so at 2x it mostly costs fill rate. Only vector HUD edges show it.
   */
  antialiasDesktop: true,
  antialiasMobile: false,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { RENDER });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

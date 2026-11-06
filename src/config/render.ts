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
   * so the canvas still fits. This is what reins in a big desktop monitor. 3600 keeps a 16" MacBook
   * (1728 CSS px wide) at a full 2x.
   */
  maxPixelWidth: 3600,
  maxPixelHeight: 2400,
  /**
   * MSAA on the back buffer, read once at startup. Off everywhere: the sprites are baked with their
   * own soft edges, and on an iPhone 15 it made no measurable difference at 2x, only vector HUD edges.
   */
  antialiasDesktop: false,
  antialiasMobile: false,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { RENDER });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

import type { Application } from "pixi.js";
import { RENDER } from "../config/render";
import { CONFIG_UPDATED } from "../debug/hotConfig";
import { IS_MOBILE } from "./device";

/** Phones fire a burst of resize events as they turn; wait this long for the last one, ms. */
const MOBILE_RESIZE_WAIT = 100;

// For testing on a device: `?dpr=3` renders at exactly that resolution, caps ignored, and `?aa=1` or
// `?aa=0` forces antialiasing on or off.
const params = new URLSearchParams(location.search);
const forcedResolution = Number(params.get("dpr"));
const forcedAntialias = params.get("aa");

/**
 * Pixels drawn per CSS px for a window this size: the screen's own density, capped, and lowered
 * further if the backing store would otherwise pass the pixel limits.
 */
export function renderResolution(width: number, height: number): number {
  return (
    forcedResolution ||
    Math.min(
      window.devicePixelRatio,
      RENDER.maxResolution,
      RENDER.maxPixelWidth / width,
      RENDER.maxPixelHeight / height,
    )
  );
}

export function renderAntialias(): boolean {
  if (forcedAntialias) return forcedAntialias !== "0";
  return IS_MOBILE ? RENDER.antialiasMobile : RENDER.antialiasDesktop;
}

/**
 * Keep the renderer matched to its canvas from here on. The canvas is CSS-sized to the window
 * (style.css), so its box is the game's logical size in CSS px, which is what the HUD, the camera
 * and input all work in; only the resolution, and so the sharpness, follows the caps.
 */
export function fitRenderer(app: Application): void {
  const { canvas, renderer } = app;
  let width = 0;
  let height = 0;
  let resolution = 0;
  const fit = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const r = renderResolution(w, h);
    if (w === width && h === height && r === resolution) return;
    width = w;
    height = h;
    resolution = r;
    renderer.resize(w, h, r);
    // Resizing clears the canvas; draw straight away rather than flash black until the next frame.
    app.render();
  };
  let pending = 0;
  window.addEventListener("resize", () => {
    if (!IS_MOBILE) {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(fit);
      return;
    }
    clearTimeout(pending);
    pending = window.setTimeout(fit, MOBILE_RESIZE_WAIT);
  });
  window.addEventListener(CONFIG_UPDATED, fit);
  fit();
}

import type { TextStyleOptions } from "pixi.js";

/** Chunky rounded type for the HUD and reticle, to sit with the flat vector art. */
export const UI_FONT = {
  fontFamily: [
    "Arial Rounded MT Bold",
    "Nunito",
    "Trebuchet MS",
    "system-ui",
    "sans-serif",
  ],
  fontWeight: "900",
} satisfies TextStyleOptions;

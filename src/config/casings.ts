import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/**
 * Spent shell casings, one sprite per ammunition family. The sprite is shipped at 2x like the
 * character art (concepts/vector/ship.sh at `width`), so it draws `width` world px long.
 */
export interface CasingDef {
  id: string;
  /** Drawn length in world px; the sprite keeps its own proportions. */
  width: number;
  /** Image under public/sprites. */
  sprite: string;
}

export const CASINGS = {
  rifle: { id: "rifle", width: 14, sprite: "/sprites/casing-rifle.png" },
  pistol: { id: "pistol", width: 10, sprite: "/sprites/casing-pistol.png" },
  shotgun: { id: "shotgun", width: 18, sprite: "/sprites/casing-shotgun.png" },
} as const satisfies Record<string, CasingDef>;

export type CasingId = keyof typeof CASINGS;

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { CASINGS });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

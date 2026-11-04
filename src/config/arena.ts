/** Arena layout. All units are world pixels. The playable floor is the inner rect; walls sit outside it. */
export const ARENA = {
  width: 1280,
  height: 720,
  wallThickness: 28,
  /** How far beyond the walls the floor texture and zombie spawn zone extend. */
  margin: 160,
  gateWidth: 220,
} as const;

export type Side = "left" | "right" | "top" | "bottom";

/** Openings in the wall that zombies pour through. One per side; remove entries to close a side. */
export const GATES: readonly Side[] = ["left", "right", "top", "bottom"];

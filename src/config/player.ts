/** Player numbers the loot system reads. The magnet pair is what a magnet power-up will scale. */
export const PLAYER = {
  /** Loot inside this radius drifts toward the player. */
  magnetRadius: 70,
  /** Acceleration at the player's feet in px/s², fading to zero at the radius edge. */
  magnetPull: 400,
  /** Added to the body radius for the overlap that collects loot. */
  collectRadius: 6,
};

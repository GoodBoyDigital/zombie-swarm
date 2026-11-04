/** Player numbers: health and contact damage, plus the loot magnet pair a magnet power-up will scale. */
export const PLAYER = {
  maxHealth: 100,
  /** Damage per second from one walker-strength zombie in contact. Types scale it by `damageScale`. */
  contactDamage: 12,
  /** Reach beyond the two body radii at which a zombie counts as touching, px. */
  contactMargin: 4,
  /** Seconds of immunity after a hit. Contact damage lands as one lump per window. */
  invulnSeconds: 0.4,
  /** Health regained per second once `regenDelay` has passed without a hit. 0 = off. */
  regenPerSecond: 0,
  regenDelay: 4,
  /** Loot inside this radius drifts toward the player. */
  magnetRadius: 70,
  /** Acceleration at the player's feet in px/s², fading to zero at the radius edge. */
  magnetPull: 400,
  /** Added to the body radius for the overlap that collects loot. */
  collectRadius: 6,
};

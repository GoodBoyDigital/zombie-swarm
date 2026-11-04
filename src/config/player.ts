import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/** Player numbers: health and contact damage, plus the loot magnet pair a magnet power-up will scale. */
export const PLAYER = {
  maxHealth: 100,
  /** Recoil velocity lost per second. Lower grip lets a shot slide further. */
  recoilGrip: 15,
  /**
   * Damage per second from one walker-strength zombie in contact. Types scale it by `damageScale`.
   * A lone zombie chips away at health; crowds multiply the danger through crowdPower.
   */
  contactDamage: 3.6,
  /**
   * Exponent on the number of zombies in contact (summed damageScale). Above 1 a crowd hurts more
   * than its headcount, so the threat is the pack that built up unnoticed: 8 walkers at 1.5 ≈ 23x.
   */
  crowdPower: 1.5,
  /** Reach beyond the two body radii at which a zombie counts as touching, px. */
  contactMargin: 4,
  /** Seconds of immunity after a hit. Contact damage lands as one lump per window. */
  invulnSeconds: 0.4,
  /** Health regained per second once `regenDelay` has passed without a hit. 0 = off. */
  regenPerSecond: 0,
  regenDelay: 4,
  /** Loot inside this radius drifts toward the player. */
  magnetRadius: 49,
  /** Acceleration of attracted loot toward its incoming speed, px/s². */
  magnetPull: 400,
  /** Incoming loot speed in px/s; raised when needed to stay ahead of the player's run speed. */
  magnetMaxSpeed: 330,
  /** Added to the body radius for the overlap that collects loot. */
  collectRadius: 6,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { PLAYER });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

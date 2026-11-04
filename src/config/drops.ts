/**
 * How power-up orbs appear and look. Which one drops is a weighted pick over every POWERUPS entry
 * (src/config/powerups.ts); colours come from POWERUP_CATEGORIES.
 */
export const DROP_RULES = {
  /** Chance that a kill leaves an orb where the zombie fell. */
  chancePerKill: 0.02,
  /** An orb also appears somewhere in the arena this often; 0 disables it. */
  timedSpawnSeconds: 25,
  lifetime: 25,
  blinkSeconds: 4,
  /** Orb body radius in world px, outline included. */
  orbRadius: 32,
  /** Icon covers the area of a square this fraction of the orb's diameter (long guns get wider, capped at the rim). */
  iconSize: 0.62,
  /** Soft halo radius as a multiple of the orb, and how far it breathes (scale) at bobSpeed. */
  glowSize: 1.45,
  glowPulse: 0.12,
  /** Hover amplitude in px and cycles per second. */
  bobHeight: 3,
  bobSpeed: 1.2,
  /** Added to the player's body radius for the overlap that collects an orb. */
  collectRadius: 24,
};

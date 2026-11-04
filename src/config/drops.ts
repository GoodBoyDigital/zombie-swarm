import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/**
 * How orbs appear and look. Guns and power-ups roll separately on each kill; within each, which one
 * drops is a weighted pick over the POWERUPS entries of that kind (src/config/powerups.ts).
 * Colours come from POWERUP_CATEGORIES.
 */
export const DROP_RULES = {
  /** Chance a kill drops a gun while the player only has the pistol: high, so you get armed soon. */
  weaponChanceOnBackup: 0.25,
  /** Chance a kill drops a gun while the player already holds a better one. */
  weaponChanceArmed: 0.008,
  /**
   * Gun chance is multiplied by this while a gun orb is already lying on the floor, so ignoring
   * one doesn't fill the arena with more.
   */
  weaponChanceWhileWaiting: 0.1,
  /** Chance a kill drops a red or pink power-up, rolled independently of guns. */
  powerupChancePerKill: 0.04,
  /**
   * Most orbs one action can drop (a trigger pull, a blast, a bomb), per kind, so a nuke through
   * a crowd doesn't carpet the floor with orbs.
   */
  maxWeaponsPerAction: 1,
  maxPowerupsPerAction: 1,
  lifetime: 25,
  blinkSeconds: 4,
  /** Orb body radius in world px, outline included. Glow and icon scale with it. */
  orbRadius: 22,
  /** Icon covers the area of a square this fraction of the orb's diameter (long guns get wider, capped at the rim). */
  iconSize: 0.62,
  /** Soft halo radius as a multiple of the orb, and how far it breathes (scale) at bobSpeed. */
  glowSize: 1.45,
  glowPulse: 0.12,
  /** Hover amplitude in px and cycles per second. */
  bobHeight: 2,
  bobSpeed: 1.2,
  /** Added to the player's body radius for the overlap that collects an orb. */
  collectRadius: 16,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { DROP_RULES });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

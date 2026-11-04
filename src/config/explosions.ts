import type { SfxName } from "../audio/Audio";
import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";

/**
 * One blast: damage and push radiating from a point, plus how it looks and feels. Damage and
 * knockback are independent, so a blast can push only, hurt only, or both. Set off with
 * `explode` (src/combat/explosion.ts).
 */
export interface ExplosionDef {
  /** World px. Zombies whose centre is inside are affected. */
  radius: number;
  /** Override the art size without changing damage or knockback. Defaults to radius. */
  visualRadius?: number;
  /** At the centre. 0 = no damage. */
  damage: number;
  /** Push speed at the centre, px/s, scaled by each zombie's knockbackScale. 0 = no push. */
  knockback: number;
  /** How damage and knockback fade with distance: 0 = flat across the radius, 1 = zero at the edge. */
  falloff: number;
  /** Fireball and white flash size, as a fraction of radius. */
  flash: number;
  /** How far the shockwave ring travels, as a fraction of radius. 0 = no ring. */
  ring: number;
  /** Seconds the fireball, flash and ring take to play out. */
  seconds: number;
  /** Sparks and chunks thrown out. */
  debris: number;
  /** Camera trauma. 1 is a heavy hit; up to 2 for the biggest blasts. */
  shake: number;
  /** Scorch mark burned into the floor, as a fraction of radius. 0 = none. */
  scorch: number;
  /** Wakes wandering zombies this far away. 0 = silent. */
  noiseRadius: number;
  sound: SfxName;
  volume: number;
  pitch: number;
}

export const EXPLOSIONS = {
  nuke: {
    radius: 252,
    visualRadius: 420,
    damage: 30,
    knockback: 1500,
    falloff: 0.6,
    flash: 0.4,
    ring: 1.05,
    seconds: 0.9,
    debris: 70,
    shake: 2,
    scorch: 0.35,
    noiseRadius: 1200,
    sound: "explosion",
    volume: 1,
    pitch: 0.7,
  },
  airstrikeBomb: {
    radius: 110,
    damage: 8,
    knockback: 650,
    falloff: 0.5,
    flash: 0.7,
    ring: 1,
    seconds: 0.5,
    debris: 18,
    shake: 0.55,
    scorch: 0.6,
    noiseRadius: 500,
    sound: "explosion",
    volume: 0.7,
    pitch: 1,
  },
  rocket: {
    radius: 90,
    damage: 8,
    knockback: 650,
    falloff: 0.85,
    flash: 0.75,
    ring: 1,
    seconds: 0.4,
    debris: 18,
    shake: 0.35,
    scorch: 0.6,
    noiseRadius: 400,
    sound: "explosion",
    volume: 0.75,
    pitch: 1.2,
  },
} as const satisfies Record<string, ExplosionDef>;

export type ExplosionId = keyof typeof EXPLOSIONS;

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { EXPLOSIONS });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

export interface WeaponDef {
  id: string;
  /** Seconds between shots while the trigger is held. */
  fireInterval: number;
  damage: number;
  /** Impulse applied to each zombie hit, in px/s. */
  knockback: number;
  /** Impulse applied to the player on each shot, in px/s. */
  recoil: number;
  /** Half-angle of random spread in radians. */
  spread: number;
  /** Max zombies one shot can hit, nearest first. 1 = stops at the first. Infinity = everything on the line. */
  pierce: number;
  range: number;
  /** Camera trauma added per shot, 0..1. */
  shake: number;
  tracerWidth: number;
  /** How far each shot is heard by wandering zombies, px. Defaults to `WEAPON_NOISE_RADIUS`. */
  noiseRadius?: number;
}

/** Noise radius for weapons that don't set their own. */
export const WEAPON_NOISE_RADIUS = 300;

export const WEAPONS = {
  rifle: {
    id: "rifle",
    fireInterval: 0.11,
    damage: 1,
    knockback: 320,
    recoil: 110,
    spread: 0.025,
    pierce: 1,
    range: 1600,
    shake: 0.22,
    tracerWidth: 3,
    noiseRadius: 420,
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

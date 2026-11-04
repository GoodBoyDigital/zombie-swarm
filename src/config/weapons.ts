import type { CasingId } from "./casings";

export interface WeaponDef {
  id: string;
  /** Shell ejected per shot, or null for weapons that leave nothing behind. */
  casing: CasingId | null;
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
}

export const WEAPONS = {
  rifle: {
    id: "rifle",
    casing: "rifle",
    fireInterval: 0.11,
    damage: 1,
    knockback: 320,
    recoil: 110,
    spread: 0.025,
    pierce: 1,
    range: 1600,
    shake: 0.22,
    tracerWidth: 3,
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

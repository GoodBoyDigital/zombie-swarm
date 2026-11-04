import type { ShotType } from "../combat/shots";

export interface WeaponDef {
  id: string;
  /** Shown in the HUD and on crates. */
  name: string;
  /** How a pellet reaches its target. See `SHOT_HANDLERS`. */
  shot: ShotType;
  /** Raycasts per trigger pull. A shotgun fires several at once. */
  pellets: number;
  /** Half-angle of random spread in radians, rolled independently per pellet. */
  spread: number;
  /** Seconds between shots while the trigger is held. */
  fireInterval: number;
  /** Shots per magazine. Each pull spends one round regardless of pellets. */
  magazine: number;
  reloadSeconds: number;
  /** Damage per pellet. */
  damage: number;
  /** Impulse applied to each zombie hit, in px/s. */
  knockback: number;
  /** Impulse applied to the player on each shot, in px/s. */
  recoil: number;
  /** Max zombies one pellet can hit, nearest first. 1 = stops at the first. Infinity = everything on the line. */
  pierce: number;
  range: number;
  /** Camera trauma added per shot, 0..1. */
  shake: number;
  tracerWidth: number;
}

export const WEAPONS = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    shot: "hitscan",
    pellets: 1,
    spread: 0.02,
    fireInterval: 0.18,
    magazine: 12,
    reloadSeconds: 0.9,
    damage: 2,
    knockback: 260,
    recoil: 70,
    pierce: 1,
    range: 1200,
    shake: 0.15,
    tracerWidth: 2,
  },
  rifle: {
    id: "rifle",
    name: "Rifle",
    shot: "hitscan",
    pellets: 1,
    spread: 0.025,
    fireInterval: 0.11,
    magazine: 30,
    reloadSeconds: 1.6,
    damage: 1,
    knockback: 320,
    recoil: 110,
    pierce: 1,
    range: 1600,
    shake: 0.22,
    tracerWidth: 3,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    shot: "hitscan",
    pellets: 8,
    spread: 0.22,
    fireInterval: 0.75,
    magazine: 6,
    reloadSeconds: 2.2,
    damage: 1,
    knockback: 420,
    recoil: 380,
    pierce: 1,
    range: 520,
    shake: 0.5,
    tracerWidth: 2,
  },
  railgun: {
    id: "railgun",
    name: "Railgun",
    shot: "hitscan",
    pellets: 1,
    spread: 0,
    fireInterval: 0.5,
    magazine: 1,
    reloadSeconds: 1.8,
    damage: 12,
    knockback: 900,
    recoil: 520,
    pierce: Infinity,
    range: 2400,
    shake: 0.7,
    tracerWidth: 8,
  },
  minigun: {
    id: "minigun",
    name: "Minigun",
    shot: "hitscan",
    pellets: 1,
    spread: 0.09,
    fireInterval: 0.035,
    magazine: 150,
    reloadSeconds: 3.5,
    damage: 1,
    knockback: 180,
    recoil: 60,
    pierce: 1,
    range: 1400,
    shake: 0.12,
    tracerWidth: 2,
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

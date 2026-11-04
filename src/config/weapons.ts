import type { CasingId } from "./casings";

export interface WeaponSprite {
  /** Image under public/sprites, point-sampled like the character art. */
  path: string;
  /** Point the player's hands hold, as fractions of the sprite. It is pinned to the player's hand point. */
  grip: { x: number; y: number };
  /** Barrel tip as fractions of the sprite. Shots, flash and tracer originate here. */
  muzzle: { x: number; y: number };
  /** Ejection port as fractions of the sprite, on the receiver. Casings leave from here. */
  eject: { x: number; y: number };
}

export interface WeaponDef {
  id: string;
  sprite: WeaponSprite;
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
  /** How far each shot is heard by wandering zombies, px. Defaults to `WEAPON_NOISE_RADIUS`. */
  noiseRadius?: number;
}

/** Noise radius for weapons that don't set their own. */
export const WEAPON_NOISE_RADIUS = 300;

export const WEAPONS = {
  rifle: {
    id: "rifle",
    sprite: {
      path: "/sprites/weapon-rifle.png",
      grip: { x: 0.3, y: 0.43 },
      muzzle: { x: 1, y: 0.43 },
      eject: { x: 0.52, y: 0.43 },
    },
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
    noiseRadius: 420,
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

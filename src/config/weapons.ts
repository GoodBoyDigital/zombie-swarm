import type { ShotType } from "../combat/shots";
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
  /** Shown in the HUD and on crates. */
  name: string;
  sprite: WeaponSprite;
  /** How a pellet reaches its target. See `SHOT_HANDLERS`. */
  shot: ShotType;
  /** Shell ejected per trigger pull, or null for weapons that leave nothing behind. */
  casing: CasingId | null;
  /** Raycasts per trigger pull. A shotgun fires several at once. */
  pellets: number;
  /** Half-angle of random spread in radians, rolled independently per pellet. */
  spread: number;
  /**
   * Extra spread gained per second of held trigger, decaying twice as fast when released.
   * 0 = fixed accuracy. Lets an SMG go wild on long bursts and tighten when feathered.
   */
  spreadBloom: number;
  /** Ceiling on spread + bloom, radians. */
  spreadMax: number;
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
  /** How far each shot is heard by wandering zombies, px. Defaults to `WEAPON_NOISE_RADIUS`. */
  noiseRadius?: number;
}

/** Noise radius for weapons that don't set their own. */
export const WEAPON_NOISE_RADIUS = 300;

export const WEAPONS = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    sprite: {
      path: "/sprites/weapon-pistol.png",
      grip: { x: 0.3, y: 0.5 },
      muzzle: { x: 1, y: 0.5 },
      eject: { x: 0.55, y: 0.3 },
    },
    shot: "hitscan",
    casing: "pistol",
    pellets: 1,
    spread: 0.04,
    spreadBloom: 0,
    spreadMax: 0.04,
    fireInterval: 0.18,
    magazine: 12,
    reloadSeconds: 0.9,
    damage: 2,
    knockback: 260,
    recoil: 32,
    pierce: 1,
    range: 1200,
    shake: 0.15,
    tracerWidth: 2,
    noiseRadius: 320,
  },
  rifle: {
    id: "rifle",
    name: "Rifle",
    sprite: {
      path: "/sprites/weapon-rifle.png",
      grip: { x: 0.3, y: 0.43 },
      muzzle: { x: 1, y: 0.43 },
      eject: { x: 0.52, y: 0.43 },
    },
    shot: "hitscan",
    casing: "rifle",
    pellets: 1,
    spread: 0.02,
    spreadBloom: 0,
    spreadMax: 0.02,
    fireInterval: 0.11,
    magazine: 30,
    reloadSeconds: 1.6,
    damage: 1,
    knockback: 320,
    recoil: 65,
    pierce: 1,
    range: 1600,
    shake: 0.22,
    tracerWidth: 3,
    noiseRadius: 420,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    sprite: {
      path: "/sprites/weapon-shotgun.png",
      grip: { x: 0.35, y: 0.55 },
      muzzle: { x: 1, y: 0.4 },
      eject: { x: 0.5, y: 0.45 },
    },
    shot: "hitscan",
    casing: "shotgun",
    pellets: 8,
    spread: 0.22,
    spreadBloom: 0,
    spreadMax: 0.22,
    fireInterval: 0.75,
    magazine: 6,
    reloadSeconds: 2.2,
    damage: 1,
    knockback: 420,
    recoil: 230,
    pierce: 1,
    range: 520,
    shake: 0.5,
    tracerWidth: 2,
    noiseRadius: 600,
  },
  railgun: {
    id: "railgun",
    name: "Railgun",
    sprite: {
      path: "/sprites/weapon-railgun.png",
      grip: { x: 0.3, y: 0.5 },
      muzzle: { x: 1, y: 0.5 },
      eject: { x: 0.4, y: 0.5 },
    },
    shot: "hitscan",
    casing: null,
    pellets: 1,
    spread: 0,
    spreadBloom: 0,
    spreadMax: 0,
    fireInterval: 0.5,
    magazine: 1,
    reloadSeconds: 1.8,
    damage: 12,
    knockback: 900,
    recoil: 320,
    pierce: Infinity,
    range: 2400,
    shake: 0.7,
    tracerWidth: 8,
    noiseRadius: 700,
  },
  minigun: {
    id: "minigun",
    name: "Minigun",
    sprite: {
      path: "/sprites/weapon-minigun.png",
      grip: { x: 0.3, y: 0.55 },
      muzzle: { x: 1, y: 0.5 },
      eject: { x: 0.45, y: 0.4 },
    },
    shot: "hitscan",
    casing: "rifle",
    pellets: 1,
    spread: 0.1,
    spreadBloom: 0.1,
    spreadMax: 0.22,
    fireInterval: 0.035,
    magazine: 150,
    reloadSeconds: 3.5,
    damage: 1,
    knockback: 180,
    recoil: 35,
    pierce: 1,
    range: 1400,
    shake: 0.12,
    tracerWidth: 2,
    noiseRadius: 450,
  },
  magnum: {
    id: "magnum",
    name: "Magnum",
    sprite: {
      path: "/sprites/weapon-magnum.png",
      grip: { x: 0.2, y: 0.55 },
      muzzle: { x: 1, y: 0.45 },
      eject: { x: 0.4, y: 0.3 },
    },
    shot: "hitscan",
    casing: "pistol",
    pellets: 1,
    spread: 0,
    spreadBloom: 0,
    spreadMax: 0,
    fireInterval: 0.45,
    magazine: 6,
    reloadSeconds: 1.4,
    damage: 6,
    knockback: 700,
    recoil: 180,
    pierce: 2,
    range: 1800,
    shake: 0.45,
    tracerWidth: 4,
    noiseRadius: 650,
  },
  uzi: {
    id: "uzi",
    name: "Uzi",
    sprite: {
      path: "/sprites/weapon-uzi.png",
      grip: { x: 0.35, y: 0.5 },
      muzzle: { x: 1, y: 0.45 },
      eject: { x: 0.5, y: 0.3 },
    },
    shot: "hitscan",
    casing: "pistol",
    pellets: 1,
    spread: 0.08,
    spreadBloom: 0.25,
    spreadMax: 0.18,
    fireInterval: 0.06,
    magazine: 32,
    reloadSeconds: 1.2,
    damage: 1,
    knockback: 120,
    recoil: 25,
    pierce: 1,
    range: 900,
    shake: 0.1,
    tracerWidth: 2,
    noiseRadius: 380,
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

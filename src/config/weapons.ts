import type { ShotType } from "../combat/shots";
import type { CasingId } from "./casings";
import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";

export interface WeaponSprite {
  /** Image under public/sprites, authored at 2x like the character art (see ART_SCALE). */
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
  /** Custom hitscan visual. Damage and piercing still use the normal raycast. */
  beam?: "rail";
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
  /**
   * Magazines a pickup comes with, the loaded one included. When the last runs dry the player
   * falls back to the pistol. Infinity = never runs out (the pistol, the backup gun).
   */
  magazines: number;
  reloadSeconds: number;
  /** Damage per pellet. */
  damage: number;
  /** Impulse applied to each zombie hit, in px/s. */
  knockback: number;
  /** Impulse applied to the player on each shot, in px/s. */
  recoil: number;
  /** Camera nudge in world px. Omitted weapons keep the normal 3 px kick. */
  cameraKick?: number;
  /** Held sprite kick in world px. Omitted weapons keep the normal 4 px snap. */
  gunKick?: number;
  /** Max zombies one pellet can hit, nearest first. 1 = stops at the first. Infinity = everything on the line. */
  pierce: number;
  range: number;
  /** Camera trauma added per shot, 0..1. */
  shake: number;
  tracerWidth: number;
  /** How far each shot is heard by wandering zombies, px. Defaults to `WEAPON_NOISE_RADIUS`. */
  noiseRadius?: number;
  /** Seconds the barrels take to wind up from rest before the first shot. Omitted weapons fire at once. */
  spinUp?: number;
  /** How far a spin-up gun shakes in the hands at full speed, px. Omitted = a faint buzz. */
  buzz?: number;
  /**
   * The magazine is fuel: seconds of held trigger rather than rounds, burned at the fire rate.
   * Reloading refuels. The chainsaw runs on it.
   */
  fuel?: boolean;
  /** Multiplier on every part's dismember chance for this gun's hits. Omitted = 1. */
  dismemberScale?: number;
  /** Chain lightning (`shot: "tesla"`): `range` reaches the first zombie, `damage` is the first link's. */
  tesla?: TeslaParams;
  /** Melee arc (`shot: "saw"`): `range` is the reach from the player, `damage` per tick. */
  saw?: SawParams;
  /** Pressure wave (`shot: "sonic"`): `range` is how far it rolls from the player, `damage` and `knockback` up close. */
  sonic?: SonicParams;
}

export interface TeslaParams {
  /** Half-angle of the cone along the aim the first strike looks in, radians. */
  cone: number;
  /** Jumps after the first strike. */
  jumps: number;
  /** How far one jump reaches from the zombie it leaves, px. */
  jumpRadius: number;
  /** Damage kept per jump: link n deals damage * falloff^n. */
  falloff: number;
  /** Seconds a struck zombie twitches in place. */
  stun: number;
  /** Glow round the emitter head: colour and halo radius at rest, px. */
  glowColor: number;
  glowSize: number;
  /** Halo opacity at rest and flat out. */
  glowIdle: number;
  glowFiring: number;
  /** Halo size multiplier flat out. */
  glowFiringScale: number;
  /** Seconds to ramp up to full heat while firing, and back down after release. */
  glowRampUp: number;
  glowRampDown: number;
  /** Sparks jumping between the prongs per second, at rest and flat out. */
  idleSparks: number;
  firingSparks: number;
}

export interface SawParams {
  /** Half-angle of the carving arc either side of the aim, radians. */
  arc: number;
  /** Player move speed while the trigger is held, as a multiplier. */
  moveScale: number;
  /** Extra blood sparks thrown sideways off the chain per zombie per tick. */
  spray: number;
  /** Gore chunks flung per zombie per tick. */
  chunks: number;
  /** Extra floor splats per tick across everything being cut. */
  splats: number;
  /** Camera trauma added per tick while the bar is in flesh. */
  cutShake: number;
  /**
   * Two-stroke exhaust puffed out of the engine housing (the sprite's `eject` point), on world time.
   * Each pair is idle then flat out; the engine's rev blends between them.
   */
  smokeInterval: number;
  smokeCutInterval: number;
  /** Puff radius at birth, px; it grows to `smokeGrow` times that. */
  smokeSize: number;
  smokeCutSize: number;
  smokeGrow: number;
  /** Peak opacity, 0..1. */
  smokeAlpha: number;
  smokeCutAlpha: number;
  smokeColor: number;
  smokeCutColor: number;
  /** Speed the puff leaves the exhaust at, px/s, sideways off the engine. */
  smokeKick: number;
  smokeCutKick: number;
  /** Seconds a puff lasts. */
  smokeLife: number;
}

export interface SonicParams {
  /** Half-angle of the wave's cone either side of the aim, radians. */
  arc: number;
  /** How fast the wave front rolls out, px/s. */
  speed: number;
  /** Share of damage and knockback lost by the end of its range: 0 = none, 1 = all. */
  falloff: number;
  /** Seconds a shoved zombie staggers (barely walking, no shudder) before it walks again. */
  stun: number;
  /** Spin given to a shoved zombie as it tumbles back, radians/s. */
  tumble: number;
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
      eject: { x: 0.55, y: 0.4 },
    },
    shot: "hitscan",
    casing: "pistol",
    pellets: 1,
    spread: 0.04,
    spreadBloom: 0,
    spreadMax: 0.04,
    fireInterval: 0.36,
    magazine: 12,
    magazines: Infinity,
    reloadSeconds: 0.63,
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
      grip: { x: 0.35, y: 0.6 },
      muzzle: { x: 1, y: 0.6 },
      eject: { x: 0.5, y: 0.45 },
    },
    shot: "hitscan",
    casing: "rifle",
    pellets: 1,
    spread: 0.02,
    spreadBloom: 0,
    spreadMax: 0.02,
    fireInterval: 0.11,
    magazine: 30,
    magazines: 7,
    reloadSeconds: 1.12,
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
      grip: { x: 0.3, y: 0.55 },
      muzzle: { x: 1, y: 0.45 },
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
    magazines: 9,
    reloadSeconds: 1.54,
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
      grip: { x: 0.25, y: 0.5 },
      muzzle: { x: 1, y: 0.45 },
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
    magazines: 15,
    reloadSeconds: 0.67,
    damage: 12,
    knockback: 900,
    recoil: 600,
    cameraKick: 10,
    gunKick: 12,
    beam: "rail",
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
      grip: { x: 0.25, y: 0.5 },
      muzzle: { x: 1, y: 0.5 },
      eject: { x: 0.45, y: 0.35 },
    },
    shot: "hitscan",
    casing: "rifle",
    pellets: 1,
    spread: 0.1,
    spreadBloom: 0.1,
    spreadMax: 0.22,
    fireInterval: 0.035,
    magazine: 150,
    magazines: 3,
    reloadSeconds: 2.45,
    damage: 1,
    knockback: 180,
    recoil: 35,
    pierce: 1,
    range: 1400,
    shake: 0.06,
    tracerWidth: 2,
    noiseRadius: 450,
    spinUp: 0.35,
  },
  magnum: {
    id: "magnum",
    name: "Magnum",
    sprite: {
      path: "/sprites/weapon-magnum.png",
      grip: { x: 0.15, y: 0.55 },
      muzzle: { x: 1, y: 0.5 },
      eject: { x: 0.35, y: 0.4 },
    },
    shot: "hitscan",
    casing: "pistol",
    pellets: 1,
    spread: 0,
    spreadBloom: 0,
    spreadMax: 0,
    fireInterval: 0.7,
    magazine: 6,
    magazines: 9,
    reloadSeconds: 0.98,
    damage: 6,
    knockback: 700,
    recoil: 420,
    cameraKick: 7,
    gunKick: 10,
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
      muzzle: { x: 1, y: 0.5 },
      eject: { x: 0.5, y: 0.35 },
    },
    shot: "hitscan",
    casing: "pistol",
    pellets: 1,
    spread: 0.18,
    spreadBloom: 0.6,
    spreadMax: 0.45,
    fireInterval: 0.06,
    magazine: 32,
    magazines: 7,
    reloadSeconds: 0.84,
    damage: 1,
    knockback: 120,
    recoil: 25,
    pierce: 1,
    range: 900,
    shake: 0.1,
    tracerWidth: 2,
    noiseRadius: 380,
  },
  rocket: {
    id: "rocket",
    name: "Rocket launcher",
    sprite: {
      path: "/sprites/weapon-rocket.png",
      grip: { x: 0.35, y: 0.5 },
      muzzle: { x: 0.98, y: 0.5 },
      eject: { x: 0.1, y: 0.5 },
    },
    shot: "rocket",
    casing: null,
    pellets: 1,
    spread: 0.015,
    spreadBloom: 0,
    spreadMax: 0.015,
    fireInterval: 0.7,
    magazine: 4,
    magazines: 7,
    reloadSeconds: 1.8,
    damage: 8,
    knockback: 650,
    recoil: 520,
    cameraKick: 8,
    gunKick: 12,
    pierce: 1,
    range: 1000,
    shake: 0.4,
    tracerWidth: 0,
    noiseRadius: 800,
  },
  tesla: {
    id: "tesla",
    name: "Tesla gun",
    sprite: {
      path: "/sprites/weapon-tesla.png",
      grip: { x: 0.3, y: 0.5 },
      muzzle: { x: 0.95, y: 0.5 },
      eject: { x: 0.5, y: 0.5 },
    },
    shot: "tesla",
    casing: null,
    pellets: 1,
    spread: 0.04,
    spreadBloom: 0,
    spreadMax: 0.04,
    fireInterval: 0.11,
    magazine: 50,
    magazines: 1,
    reloadSeconds: 1.6,
    damage: 2,
    knockback: 90,
    recoil: 20,
    cameraKick: 1,
    gunKick: 2,
    pierce: 1,
    range: 260,
    shake: 0.08,
    tracerWidth: 3,
    noiseRadius: 400,
    tesla: {
      cone: 0.35,
      jumps: 10,
      jumpRadius: 85,
      falloff: 0.88,
      stun: 0.25,
      glowColor: 0x4aa8ff,
      glowSize: 11,
      glowIdle: 0.6,
      glowFiring: 1,
      glowFiringScale: 1.9,
      glowRampUp: 0.06,
      glowRampDown: 0.2,
      idleSparks: 2.5,
      firingSparks: 30,
    },
  },
  chainsaw: {
    id: "chainsaw",
    name: "Chainsaw",
    sprite: {
      path: "/sprites/weapon-chainsaw.png",
      grip: { x: 0.3, y: 0.68 },
      muzzle: { x: 1, y: 0.72 },
      eject: { x: 0.36, y: 0.95 },
    },
    shot: "saw",
    casing: null,
    pellets: 1,
    spread: 0,
    spreadBloom: 0,
    spreadMax: 0,
    fireInterval: 0.08,
    magazine: 12,
    magazines: 4,
    reloadSeconds: 1.8,
    damage: 0.8,
    knockback: 50,
    recoil: 0,
    cameraKick: 0.6,
    gunKick: 1.5,
    pierce: Infinity,
    range: 67,
    shake: 0.06,
    tracerWidth: 0,
    noiseRadius: 650,
    spinUp: 0.25,
    buzz: 2.9,
    fuel: true,
    dismemberScale: 2,
    saw: {
      arc: 0.95,
      moveScale: 0.6,
      spray: 12,
      chunks: 4,
      splats: 3,
      cutShake: 0.14,
      smokeInterval: 0.25,
      smokeCutInterval: 0.07,
      smokeSize: 3,
      smokeCutSize: 4.5,
      smokeGrow: 2.4,
      smokeAlpha: 0.6,
      smokeCutAlpha: 0.8,
      smokeColor: 0xbac6d6,
      smokeCutColor: 0x8794a6,
      smokeKick: 45,
      smokeCutKick: 150,
      smokeLife: 0.6,
    },
  },
  sonic: {
    id: "sonic",
    name: "Sonic cannon",
    sprite: {
      path: "/sprites/weapon-sonic.png",
      grip: { x: 0.3, y: 0.5 },
      muzzle: { x: 0.95, y: 0.5 },
      eject: { x: 0.4, y: 0.5 },
    },
    shot: "sonic",
    casing: null,
    pellets: 1,
    spread: 0,
    spreadBloom: 0,
    spreadMax: 0,
    fireInterval: 0.55,
    magazine: 8,
    magazines: 5,
    reloadSeconds: 1.5,
    damage: 0.5,
    knockback: 1300,
    recoil: 180,
    cameraKick: 5,
    gunKick: 6,
    pierce: Infinity,
    range: 340,
    shake: 0.3,
    tracerWidth: 0,
    noiseRadius: 500,
    dismemberScale: 0.25,
    sonic: {
      arc: 0.52,
      speed: 560,
      falloff: 0.6,
      stun: 0.5,
      tumble: 9,
    },
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

/** The gun every run starts with and the one you fall back to when a pickup runs dry. Never drops. */
export const BACKUP_WEAPON: WeaponId = "pistol";
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { WEAPONS });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

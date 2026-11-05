import type { SfxName } from "../audio/Audio";
import type { ExplosionId } from "./explosions";
import type { GradeDef } from "./grade";
import { PLAYER } from "./player";
import type { WeaponId } from "./weapons";
import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";

/** Blue arms you, pink helps you out, red hurts everything around you. Pink so it never hides in the green gore. */
export type PowerupCategory = "weapon" | "support" | "destructive";

export interface CategoryDef {
  /** Orb fill and HUD pill colour. */
  color: number;
  /** Played on pickup unless the power-up names its own. */
  sound: SfxName;
}

export const POWERUP_CATEGORIES = {
  weapon: { color: 0x3d8bff, sound: "pickupWeapon" },
  support: { color: 0xff3fc8, sound: "powerupPickup" },
  destructive: { color: 0xff4436, sound: "powerupPickup" },
} as const satisfies Record<PowerupCategory, CategoryDef>;

/** Multipliers the `modifiers` effect applies while active. Missing fields mean x1. */
export interface Modifiers {
  moveSpeed: number;
  fireInterval: number;
  damage: number;
  /** Multiplier on reload time. */
  reload: number;
  /** Shot intensity: tracer width and heat. 1 = normal. */
  shotPower: number;
  magnetRadius: number;
  magnetPull: number;
  spread: number;
  /** World clock: the horde, gore, loot and projectiles. Power-up timers always keep real time. */
  timeScale: number;
  /** Player clock: his movement, fire rate and reload. Aiming stays instant. */
  playerTimeScale: number;
}

interface PowerupBase {
  id: string;
  /** Shown in the HUD. */
  name: string;
  category: PowerupCategory;
  /** Sprite drawn on the orb and the HUD pill. */
  icon: string;
  /** Relative chance of being the one that drops. 0 never drops. */
  weight: number;
  /** Overrides the category's pickup sound. */
  sound?: SfxName;
}

/** Runs for `seconds`, shown as a HUD pill; another pickup of the same id refreshes the timer. */
interface Timed {
  mode: "timed";
  seconds: number;
}

/** Happens on pickup. Its effect may still keep itself alive briefly for visuals (see ActivePowerup.left). */
interface Instant {
  mode: "instant";
}

/**
 * Every pickup in the game. `effect` names the handler in POWERUP_EFFECTS (src/powerups/registry.ts);
 * the rest of each member is that handler's params. Add a member here for a new effect.
 */
export type PowerupDef = PowerupBase &
  (
    | (Timed & {
        effect: "magnet";
        modifiers: Partial<Modifiers>;
        /** Rings rippling in toward the player, and the lightning on incoming loot. */
        ringColor: number;
      })
    | (Timed & {
        effect: "speed";
        modifiers: Partial<Modifiers>;
        /** Fading afterimages of the player left behind while he moves. */
        trailColor: number;
      })
    | (Timed & {
        effect: "power";
        modifiers: Partial<Modifiers>;
        /** Spinning aura on the ground under the player: radius px, turns per second, colour. */
        auraRadius: number;
        auraSpin: number;
        auraColor: number;
      })
    | (Timed & {
        effect: "slowMo";
        /** World clock while fully slowed. */
        timeScale: number;
        /**
         * The player's clock while fully slowed (movement, fire rate, reload): slowed by less than
         * the world so he still has the edge, dodging through it. Aiming stays instant.
         */
        playerTimeScale: number;
        /** Seconds to ease both clocks into slow motion on pickup, and back out as it runs out. */
        easeSeconds: number;
        /** Playback rate of sound effects and of the music while fully slowed. */
        sfxRate: number;
        musicRate: number;
        /** Colour grade over the world while slowed. The player is spared it and stays in colour. */
        grade: GradeDef;
      })
    | (Instant & { effect: "equip"; weapon: WeaponId })
    | (Instant & { effect: "heal"; heal: number })
    | (Instant & {
        effect: "nuke";
        explosion: ExplosionId;
        /** Peak alpha of the white screen flash, and how long it takes to fade. */
        screenFlash: number;
        screenFlashSeconds: number;
      })
    | (Timed & { effect: "shield" } & DomeParams & {
          /** Outward knockback given to a zombie that walks into the bubble, px/s. */
          shove: number;
        })
    | (Timed & { effect: "portal" } & DomeParams)
    | (Instant & {
        effect: "airstrike";
        /** Each bomb's blast; the last one is scaled up by `lastBombScale`. */
        explosion: ExplosionId;
        /** Plane art, loaded with the icons by textures.ts. Drawn nose right. */
        sprite: string;
        /** Seconds the strike line flashes before the plane arrives. */
        warningSeconds: number;
        /** World px per second across the view. */
        planeSpeed: number;
        bombs: number;
        /** World px between bomb impacts along the line. */
        bombSpacing: number;
        /** Seconds from release to impact. */
        bombDelay: number;
        /** Bombs alternate either side of the line, up to this far off it, world px. */
        bombSpread: number;
        /** Random nudge along the line, either way, world px, so impacts never sit in a row. */
        bombJitter: number;
        /** Radius, damage and shake multiplier on the final bomb. */
        lastBombScale: number;
        /** Total camera trauma the bombs before the last may add between them, so the run doesn't blur. */
        shakeBudget: number;
        /** Gun bursts fired at the ground ahead of the bombs, rounds per burst, damage per round. */
        strafeBursts: number;
        strafeRounds: number;
        strafeDamage: number;
      })
  );

/** An electric dome zombies can't enter (shield, safety portal). */
interface DomeParams {
  /** World px. */
  radius: number;
  /** Seconds for the dome to grow from nothing to full size, shoving zombies out as it goes. */
  openSeconds: number;
  /** Final seconds in which the dome flickers to warn it is about to drop. */
  flickerSeconds: number;
  /** How far the floor and zombies seen through the dome are displaced, px. */
  ripple: number;
}

export type EffectId = PowerupDef["effect"];
/** The PowerupDef member a given effect handler receives. */
export type EffectDef<K extends EffectId> = Extract<PowerupDef, { effect: K }>;

const gun = (id: WeaponId, name: string, weight: number) =>
  ({
    id,
    name,
    category: "weapon",
    mode: "instant",
    effect: "equip",
    weapon: id,
    icon: `/sprites/weapon-${id}.png`,
    weight,
  }) as const;

export const POWERUPS = {
  rifle: gun("rifle", "Rifle", 3),
  shotgun: gun("shotgun", "Shotgun", 3),
  railgun: gun("railgun", "Railgun", 1),
  minigun: gun("minigun", "Minigun", 1),
  magnum: gun("magnum", "Magnum", 2),
  uzi: gun("uzi", "Uzi", 3),
  rocket: gun("rocket", "Rocket launcher", 1.5),
  tesla: gun("tesla", "Tesla gun", 1.5),
  chainsaw: gun("chainsaw", "Chainsaw", 1.5),
  sonic: gun("sonic", "Sonic cannon", 1.5),
  medkit: {
    id: "medkit",
    name: "Medkit",
    category: "support",
    mode: "instant",
    effect: "heal",
    heal: 15,
    icon: "/sprites/icon-medkit.png",
    weight: 1,
    sound: "pickupHealth",
  },
  magnet: {
    id: "magnet",
    name: "Magnet",
    category: "support",
    mode: "timed",
    seconds: 15,
    effect: "magnet",
    modifiers: { magnetRadius: 200 / PLAYER.magnetRadius, magnetPull: 2 },
    ringColor: 0xff3fc8,
    icon: "/sprites/icon-powerup-magnet.png",
    weight: 1,
  },
  powerMode: {
    id: "powerMode",
    name: "Power mode",
    category: "support",
    mode: "timed",
    seconds: 10,
    effect: "power",
    modifiers: { fireInterval: 0.5, reload: 0.5, damage: 2, shotPower: 2 },
    auraRadius: 34,
    auraSpin: 0.6,
    auraColor: 0xffc23a,
    icon: "/sprites/icon-powerup-power.png",
    weight: 1,
  },
  speed: {
    id: "speed",
    name: "Speed",
    category: "support",
    mode: "timed",
    seconds: 10,
    effect: "speed",
    modifiers: { moveSpeed: 1.2 },
    trailColor: 0x7fd8ff,
    icon: "/sprites/icon-powerup-speed.png",
    weight: 1,
  },
  slowMo: {
    id: "slowMo",
    name: "Slow-mo",
    category: "support",
    mode: "timed",
    seconds: 10,
    effect: "slowMo",
    timeScale: 0.35,
    playerTimeScale: 0.6,
    easeSeconds: 0.3,
    sfxRate: 0.6,
    musicRate: 0.75,
    grade: {
      saturation: 0,
      contrast: 1.15,
      brightness: 0.95,
      tint: { r: 1, g: 1, b: 1.04 },
    },
    icon: "/sprites/icon-powerup-slowmo.png",
    weight: 1,
  },
  shield: {
    id: "shield",
    name: "Shield",
    category: "support",
    mode: "timed",
    seconds: 8,
    effect: "shield",
    radius: 48,
    shove: 140,
    openSeconds: 0.2,
    flickerSeconds: 1.5,
    ripple: 5,
    icon: "/sprites/icon-powerup-shield.png",
    weight: 1,
  },
  portal: {
    id: "portal",
    name: "Safety portal",
    category: "support",
    mode: "timed",
    seconds: 12,
    effect: "portal",
    radius: 110,
    openSeconds: 0.4,
    flickerSeconds: 1.5,
    ripple: 7,
    icon: "/sprites/icon-powerup-portal.png",
    weight: 1,
  },
  nuke: {
    id: "nuke",
    name: "Mini nuke",
    category: "destructive",
    mode: "instant",
    effect: "nuke",
    explosion: "nuke",
    screenFlash: 0.85,
    screenFlashSeconds: 0.7,
    icon: "/sprites/icon-powerup-nuke.png",
    weight: 1,
  },
  airstrike: {
    id: "airstrike",
    name: "Airstrike",
    category: "destructive",
    mode: "instant",
    effect: "airstrike",
    explosion: "airstrikeBomb",
    sprite: "/sprites/airstrike-plane.png",
    warningSeconds: 0.6,
    planeSpeed: 1000,
    bombs: 8,
    bombSpacing: 105,
    bombDelay: 0.35,
    bombSpread: 45,
    bombJitter: 30,
    lastBombScale: 1.35,
    shakeBudget: 1.4,
    strafeBursts: 3,
    strafeRounds: 5,
    strafeDamage: 2,
    icon: "/sprites/icon-powerup-airstrike.png",
    weight: 1,
    sound: "airstrikeWarning",
  },
} as const satisfies Record<string, PowerupDef>;

export type PowerupId = keyof typeof POWERUPS;
export const POWERUP_DEFS: readonly PowerupDef[] = Object.values(POWERUPS);
/** Gun pickups (blue). The backup pistol is never one of them. */
export const WEAPON_DROPS = POWERUP_DEFS.filter((d) => d.category === "weapon");
/** Everything else: support (pink) and destructive (red). */
export const POWERUP_DROPS = POWERUP_DEFS.filter(
  (d) => d.category !== "weapon",
);

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { POWERUP_CATEGORIES, POWERUPS });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

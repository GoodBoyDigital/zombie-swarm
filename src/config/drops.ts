import type { PowerupId } from "./powerups";
import type { WeaponId } from "./weapons";

/** Rare pickups: a weapon on a crate, or a power-up as a glowing orb. */
export type DropDef =
  | { id: string; kind: "weapon"; weapon: WeaponId; weight: number }
  | { id: string; kind: "powerup"; powerup: PowerupId; weight: number };

export const DROPS = {
  pistol: { id: "pistol", kind: "weapon", weapon: "pistol", weight: 3 },
  rifle: { id: "rifle", kind: "weapon", weapon: "rifle", weight: 3 },
  shotgun: { id: "shotgun", kind: "weapon", weapon: "shotgun", weight: 3 },
  railgun: { id: "railgun", kind: "weapon", weapon: "railgun", weight: 1 },
  minigun: { id: "minigun", kind: "weapon", weapon: "minigun", weight: 1 },
  magnum: { id: "magnum", kind: "weapon", weapon: "magnum", weight: 2 },
  uzi: { id: "uzi", kind: "weapon", weapon: "uzi", weight: 3 },
  magnet: { id: "magnet", kind: "powerup", powerup: "magnet", weight: 2 },
  rapidFire: {
    id: "rapidFire",
    kind: "powerup",
    powerup: "rapidFire",
    weight: 2,
  },
  doubleDamage: {
    id: "doubleDamage",
    kind: "powerup",
    powerup: "doubleDamage",
    weight: 2,
  },
  speed: { id: "speed", kind: "powerup", powerup: "speed", weight: 2 },
} as const satisfies Record<string, DropDef>;

export const DROP_DEFS: readonly DropDef[] = Object.values(DROPS);

export const DROP_RULES = {
  /** Chance that a kill leaves a crate where the zombie fell. */
  chancePerKill: 0.02,
  /** A crate also appears somewhere in the arena this often; 0 disables it. */
  timedSpawnSeconds: 25,
  lifetime: 25,
  blinkSeconds: 4,
  /** Hover amplitude in px and cycles per second. */
  bobHeight: 2,
  bobSpeed: 2.5,
  /** Added to the body radius for the overlap that collects a crate. */
  collectRadius: 14,
};

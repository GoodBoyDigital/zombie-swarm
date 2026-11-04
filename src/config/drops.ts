import type { WeaponId } from "./weapons";

/** Rare pickups shown on a crate. Power-ups are planned as a second kind and not built yet. */
export type DropDef =
  | { id: string; kind: "weapon"; weapon: WeaponId; weight: number }
  | { id: string; kind: "powerup"; powerup: string; weight: number };

export const DROPS = {
  pistol: { id: "pistol", kind: "weapon", weapon: "pistol", weight: 3 },
  rifle: { id: "rifle", kind: "weapon", weapon: "rifle", weight: 3 },
  shotgun: { id: "shotgun", kind: "weapon", weapon: "shotgun", weight: 3 },
  railgun: { id: "railgun", kind: "weapon", weapon: "railgun", weight: 1 },
  minigun: { id: "minigun", kind: "weapon", weapon: "minigun", weight: 1 },
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

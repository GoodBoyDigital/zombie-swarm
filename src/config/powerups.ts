/** Multipliers a power-up applies while active. Missing fields mean x1. */
export interface Modifiers {
  moveSpeed: number;
  fireInterval: number;
  damage: number;
  magnetRadius: number;
  magnetPull: number;
  spread: number;
}

export interface PowerupDef {
  id: string;
  /** Shown in the HUD. */
  name: string;
  seconds: number;
  modifiers: Partial<Modifiers>;
}

export const POWERUPS = {
  magnet: {
    id: "magnet",
    name: "Magnet",
    seconds: 15,
    modifiers: { magnetRadius: 4, magnetPull: 2 },
  },
  rapidFire: {
    id: "rapidFire",
    name: "Rapid fire",
    seconds: 10,
    modifiers: { fireInterval: 0.5 },
  },
  doubleDamage: {
    id: "doubleDamage",
    name: "Double damage",
    seconds: 12,
    modifiers: { damage: 2 },
  },
  speed: {
    id: "speed",
    name: "Speed",
    seconds: 10,
    modifiers: { moveSpeed: 1.4 },
  },
} as const satisfies Record<string, PowerupDef>;

export type PowerupId = keyof typeof POWERUPS;

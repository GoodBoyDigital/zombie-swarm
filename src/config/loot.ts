/** Which HUD counter a pickup feeds. */
export type LootCounter = "coins" | "gems";

export interface LootDef {
  id: string;
  counter: LootCounter;
  /** Added to the counter when collected. */
  value: number;
  /** Relative chance in the drop table. */
  weight: number;
}

export const LOOT = {
  coin: { id: "coin", counter: "coins", value: 1, weight: 70 },
  gem: { id: "gem", counter: "gems", value: 5, weight: 25 },
  bigGem: { id: "bigGem", counter: "gems", value: 25, weight: 5 },
} as const satisfies Record<string, LootDef>;

export type LootId = keyof typeof LOOT;
export const LOOT_DEFS: readonly LootDef[] = Object.values(LOOT);

/** The pinata: how much each kill throws out, how it scatters and how long it lies there. */
export const LOOT_RULES = {
  burstMin: 3,
  burstMax: 4,
  /** Scatter speed in px/s, picked per item. */
  scatterMin: 120,
  scatterMax: 260,
  /** Exponential drag on the scatter, per second. */
  friction: 5,
  /** Height the burst throws items to, as a vertical launch speed in px/s. */
  hopMin: 120,
  hopMax: 240,
  lifetime: 20,
  /** Items blink for this long before vanishing. */
  blinkSeconds: 3,
  /** Hard cap; past it the oldest item is recycled first. */
  maxItems: 3000,
};

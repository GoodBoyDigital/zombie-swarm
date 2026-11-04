import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/** Which HUD counter a pickup feeds. */
export type LootCounter = "coins" | "gems";

export interface LootDef {
  id: string;
  counter: LootCounter;
  /** Added to the counter when collected. */
  value: number;
  /** Width on the floor in world px. The sprite is scaled to match. */
  size: number;
  /** Relative chance in the drop table. */
  weight: number;
}

export const LOOT = {
  coin: { id: "coin", counter: "coins", value: 1, size: 19, weight: 45 },
  bill: { id: "bill", counter: "coins", value: 1, size: 24, weight: 25 },
  gem: { id: "gem", counter: "gems", value: 5, size: 24, weight: 25 },
  bigGem: { id: "bigGem", counter: "gems", value: 25, size: 32, weight: 5 },
} as const satisfies Record<string, LootDef>;

export type LootId = keyof typeof LOOT;
export const LOOT_DEFS: readonly LootDef[] = Object.values(LOOT);

/** The pinata: how much each kill throws out, how it scatters and how long it lies there. */
export const LOOT_RULES = {
  burstMin: 3,
  burstMax: 4,
  /** Scatter speed in px/s, picked per item. Kept low so the pile lands by the body. */
  scatterMin: 60,
  scatterMax: 130,
  /** Share of the body's knockback velocity every item inherits, so loot sprays along the shot. */
  inheritVelocity: 0.5,
  /** Exponential drag on the scatter, per second. */
  friction: 7,
  /** Height the burst throws items to, as a vertical launch speed in px/s. */
  hopMin: 120,
  hopMax: 240,
  lifetime: 20,
  /** Items blink for this long before vanishing. */
  blinkSeconds: 3,
  /** Hard cap; past it the oldest item is recycled first. */
  maxItems: 3000,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { LOOT, LOOT_RULES });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

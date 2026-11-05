import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/**
 * Frozen zombies, whatever froze them (the Ice Explosion power-up today). How long and how wide is
 * the freezer's call; this is the shared look of the ice and how it breaks.
 */
export const ICE = {
  /** Multiplied into the zombie's sprite while frozen, so the body under the ice reads cold. */
  frozenTint: 0x8fd4ff,
  /** Tint on limbs a shatter throws, paler than the body so they read frosted, not just dark. */
  limbTint: 0xc8ecff,
  /** Ice block size over the zombie sprite's bounds, and its random size jitter either way. */
  blockSize: 1.12,
  blockJitter: 0.08,
  /** Random turn of the block off the body, either way, radians. */
  blockTilt: 0.25,
  blockAlpha: 0.92,
  /** Seconds a fresh block flashes white (drawn additive) on the freeze frame before it reads as ice. */
  flashSeconds: 0.06,
  /** Thaw warning: ice flicker rate, Hz, and how far the block shakes, world px. */
  flickerRate: 14,
  shake: 1,
  /** Ice shards and glints flung out by a shatter, and by a block breaking on thaw. */
  shatterShards: 18,
  thawShards: 6,
  /** Chance each attached limb or head flies off frozen on a shatter. */
  limbChance: 0.6,
  /** Chunks of ice block tossed out by a shatter; they skid and settle on the floor. Scale 1 is the baked size. */
  chunks: 7,
  chunkScale: 1,
  /** Size of the slush and frost a shatter stamps into the floor; 1 is a 30 px frost mark. */
  splatScale: 2,
  /** Least fling a shatter gets, px/s, so a soft hit still throws the pieces clear. */
  minFling: 160,
  /** At most one shatter, and one crack, sound this often, seconds. */
  soundGap: 0.06,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { ICE });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

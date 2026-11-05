import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";

/**
 * One level: the same arena for now, with its own floor and a tougher swarm. Run length lives here
 * too, so a later level can be a longer hold-out. Extracting unlocks the next entry.
 */
export interface LevelDef {
  name: string;
  /** Seconds from the start of the run until the chopper is called in. */
  seconds: number;
  floor: {
    /** Repeating concrete texture under everything. */
    tile: FloorTile;
    tint: number;
  };
  /** Multiplier on every zombie type's health. */
  zombieHealth: number;
  /** Multiplier on SPAWN's start and end rates. */
  spawnRate: number;
  /** Shifts SPAWN_TABLE earlier by this share of the run: 0.25 means each row arrives a quarter of the run sooner. */
  mixLead: number;
  /** Multiplier on brute weights in SPAWN_TABLE. */
  bruteWeight: number;
}

export type FloorTile = "concrete" | "blotchy";

export const LEVELS: LevelDef[] = [
  {
    name: "Level 1",
    seconds: 180,
    floor: { tile: "concrete", tint: 0xb4b4ae },
    zombieHealth: 1,
    spawnRate: 1,
    mixLead: 0,
    bruteWeight: 1,
  },
  {
    name: "Level 2",
    seconds: 180,
    floor: { tile: "blotchy", tint: 0xc4b497 },
    zombieHealth: 1.35,
    spawnRate: 1.2,
    mixLead: 0.15,
    bruteWeight: 1.6,
  },
  {
    name: "Level 3",
    seconds: 180,
    floor: { tile: "concrete", tint: 0x8f9ea3 },
    zombieHealth: 1.75,
    spawnRate: 1.4,
    mixLead: 0.3,
    bruteWeight: 2.4,
  },
];

/** Extraction: the countdown's last stretch, the chopper's flight and landing, boarding. World px and seconds. */
export const RUN = {
  /** The countdown turns urgent (red, pulsing, rotor audible far off) for this long before zero. */
  finalSeconds: 60,
  /** The rotor fades in from far off this long before zero, so the call is heard before it's seen. */
  rotorLeadSeconds: 12,
  /** Rotor loop level when the chopper is right on top of the player, and the distance it fades out over. */
  rotorVolume: 0.8,
  rotorHearing: 1400,
  /** Seconds from the call to touchdown: the chopper's approach and descent. */
  approachSeconds: 7,
  descendSeconds: 2.5,
  /** How long the player must stand in the landing zone to board. */
  boardSeconds: 1,
  /** Landing zone radius; the player boards from anywhere inside it. */
  zoneRadius: 70,
  /** Chopper art scale on the shipped sprite, and how high it flies (shadow offset grows with height). */
  scale: 1.6,
  cruiseAltitude: 120,
  rotorSpin: 26,
  /**
   * The body's ground footprint as circles along its tail-to-nose line, in sprite px from the rotor
   * hub (+ toward the nose), scaled by `scale`. Zombies inside it are squished at touchdown, and it is
   * a keep-out zone for the horde until lift-off. Press V to see it.
   */
  footprint: [
    { along: 28, radius: 29 },
    { along: -3, radius: 29 },
    { along: -47, radius: 14 },
    { along: -72, radius: 14 },
    { along: -94, radius: 17 },
  ],
  /**
   * Descent wash: zombies within `descentReach` px of the body's line are shoved straight out from it,
   * at up to `descentPush` px/s, ramping up as the chopper drops (strongest just before touchdown).
   */
  descentPush: 420,
  descentReach: 120,
  /** At touchdown a zombie is squished if its centre is inside a footprint circle grown by this share of its own radius. */
  squishOverlap: 0.5,
  /**
   * Rotor slicing while landed: on each blade pass, every zombie within `sliceRadius` px of the hub
   * has `sliceChance` of being chopped, limited to `slicesPerSecond` (with bursts up to `sliceBurst`).
   * Chopped zombies lose limbs and head, which fly off along the blade at `sliceFling` px/s. No reward.
   */
  sliceRadius: 135,
  sliceChance: 0.12,
  slicesPerSecond: 5,
  sliceBurst: 3,
  sliceFling: 520,
  /** Chance each attached part comes off when chopped, and blood sparks per chop. */
  slicePartChance: 0.7,
  sliceSpray: 26,
  /** Minimum seconds between chop sounds. */
  chopSoundGap: 0.12,
  /** Rotor wash while low: zombies inside `washRadius` drift outward at up to `washPush` px/s, fading to 0 at the edge. */
  washRadius: 170,
  washPush: 160,
  /** Dust puffs blown out from under the chopper per second at full wash. */
  washDust: 40,
  /** Seconds after boarding before the results card: the chopper lifts off and leaves. */
  departSeconds: 3,
  /** Landing spots inside the walls, as fractions of the arena. Weighted toward the far ones. */
  landingSpots: [
    { x: 0.13, y: 0.18 },
    { x: 0.87, y: 0.18 },
    { x: 0.13, y: 0.82 },
    { x: 0.87, y: 0.82 },
    { x: 0.5, y: 0.2 },
    { x: 0.5, y: 0.8 },
  ],
  /** Spot weight is distance from the player to this power, so far spots win most of the time. */
  farBias: 3,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { LEVELS, RUN });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

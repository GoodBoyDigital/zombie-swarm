import type { SfxName } from "../audio/Audio";

export interface ZombieArt {
  /** Sprite set in public/sprites: zombie-<key>.png and zombie-<key>-flash.png. */
  key: string;
  /** Lying-down poses, zombie-<key>-corpse-<n>.png; one is picked at random per death. */
  corpses: readonly number[];
  /** Body radius the sprites were drawn for, in world px once ART_SCALE is applied. The sprite is scaled by the def's radius over this. */
  radius: number;
  /** Where the body centre sits in the texture, as fractions; the arms reach ahead of it. */
  anchor: { x: number; y: number };
}

/** Brain numbers a type may override; anything left out comes from ZOMBIE_AI. */
export type ZombieAiOverrides = Partial<
  Pick<
    typeof ZOMBIE_AI,
    | "aggroRadius"
    | "loseRadius"
    | "wanderSpeedScale"
    | "reactionDelayMin"
    | "reactionDelayMax"
    | "shuffle"
    | "stepLength"
    | "sway"
    | "squash"
  >
>;

export interface ZombieDef {
  id: string;
  art: ZombieArt;
  radius: number;
  /** Base move speed in px/s. Each instance gets +/- speedVariance. */
  speed: number;
  speedVariance: number;
  health: number;
  /** Multiplier applied to incoming knockback. 1 = normal, 0 = immovable. */
  knockbackScale: number;
  /** Crowding weight. When two zombies overlap the lighter one takes more of the push apart. */
  mass: number;
  color: number;
  ai: ZombieAiOverrides;
  /** Idle vocalisations for this type, one picked at random per groan. */
  groans: readonly SfxName[];
  /** Playback rate for its sounds. 1 = as recorded. */
  voicePitch: number;
  /** Multiplier on how much loot a kill throws out. */
  lootScale: number;
}

/** How fast knockback bleeds off, per second. Shared by the living and by sliding bodies. */
export const KNOCKBACK_DRAG = 9;

export const ZOMBIES = {
  walker: {
    id: "walker",
    art: {
      key: "walker",
      corpses: [1, 2, 3],
      radius: 12,
      anchor: { x: 0.28, y: 0.52 },
    },
    radius: 12,
    speed: 40,
    speedVariance: 12,
    health: 3,
    knockbackScale: 1,
    mass: 1,
    color: 0xffffff,
    // Wander share raised so wandering stays near its old ~30 px/s while the chase got slower.
    ai: { wanderSpeedScale: 0.75 },
    groans: ["groan1", "groan2"],
    voicePitch: 1,
    lootScale: 1,
  },
  runner: {
    id: "runner",
    art: {
      key: "runner",
      corpses: [1, 2, 3],
      // Skinny top-down art: head centred 16% across, about 8 px radius including outline.
      radius: 8,
      anchor: { x: 0.16, y: 0.5 },
    },
    radius: 10,
    speed: 170,
    speedVariance: 25,
    health: 2,
    knockbackScale: 1.4,
    mass: 0.6,
    color: 0xffffff,
    ai: {
      aggroRadius: 420,
      loseRadius: 600,
      wanderSpeedScale: 0.4,
      reactionDelayMin: 0.02,
      reactionDelayMax: 0.08,
      shuffle: 0.12,
      stepLength: 24,
      sway: 0.03,
      squash: 0.02,
    },
    groans: ["runnerShriek"],
    voicePitch: 1.15,
    lootScale: 1,
  },
  brute: {
    id: "brute",
    art: {
      key: "brute",
      corpses: [1, 2, 3],
      radius: 20,
      anchor: { x: 0.4, y: 0.5 },
    },
    radius: 20,
    speed: 45,
    speedVariance: 8,
    health: 15,
    knockbackScale: 0.25,
    mass: 4,
    color: 0xffffff,
    ai: {
      aggroRadius: 180,
      wanderSpeedScale: 0.7,
      shuffle: 0.7,
      stepLength: 56,
      sway: 0.09,
      squash: 0.05,
    },
    groans: ["bruteGroan"],
    voicePitch: 0.8,
    lootScale: 3,
  },
} as const satisfies Record<string, ZombieDef>;

export type ZombieId = keyof typeof ZOMBIES;

export const MAX_ZOMBIE_RADIUS = Math.max(
  ...Object.values(ZOMBIES).map((z) => z.radius),
);

/**
 * What spawns when. Each row gives relative weights per type at `at` seconds of play; weights are
 * interpolated between rows and held flat after the last one. Runners start at 30 s, brutes at 75 s.
 */
export const SPAWN_TABLE: readonly {
  at: number;
  weights: Record<ZombieId, number>;
}[] = [
  { at: 0, weights: { walker: 1, runner: 0, brute: 0 } },
  { at: 30, weights: { walker: 1, runner: 0, brute: 0 } },
  { at: 60, weights: { walker: 1, runner: 0.25, brute: 0 } },
  { at: 75, weights: { walker: 1, runner: 0.3, brute: 0.03 } },
  { at: 150, weights: { walker: 1, runner: 0.45, brute: 0.12 } },
  { at: 240, weights: { walker: 1, runner: 0.6, brute: 0.2 } },
];

/**
 * Wander/chase tuning shared by every zombie. Kept flat and mutable so a tuning panel can bind straight to it.
 * Zombies wander until the player comes within `aggroRadius` or a gunshot's noise reaches them, then chase for good.
 */
export const ZOMBIE_AI = {
  /** Wander move speed as a fraction of the zombie's chase speed. */
  wanderSpeedScale: 0.55,
  /** Peak random turn rate while wandering, radians/s. The rate itself drifts slowly, so the heading meanders. */
  turnNoise: 0.7,
  /** Seconds between picking a new wander point, min..max per zombie. */
  retargetIntervalMin: 2,
  retargetIntervalMax: 4,
  /**
   * How far away each new wander point is, min..max px, in a random direction from where the zombie stands.
   * A random walk like this diffuses the horde across the arena; aiming at uniformly random arena points
   * instead would pull everyone back toward the middle on every retarget.
   */
  wanderLegMin: 200,
  wanderLegMax: 500,
  /** Distance at which a wanderer notices the player, px. */
  aggroRadius: 260,
  /** Seconds between noticing the player or a noise and starting to chase, min..max per zombie. */
  reactionDelayMin: 0.1,
  reactionDelayMax: 0.5,
  /** A chaser stays interested while the player is within this, px. Larger than aggroRadius. */
  loseRadius: 420,
  /** Seconds outside loseRadius with no noise before a chaser goes back to wandering, +/- the jitter per zombie. */
  loseInterestSeconds: 4,
  loseInterestJitter: 1,
  /** Pull toward the average position of nearby zombies while wandering. 0 = off. */
  herdCohesion: 0.25,
  /** Pull toward the average heading of nearby zombies while wandering. 0 = off. */
  herdAlignment: 0.3,
  /** Neighbour count at which cohesion fades to nothing, so herds stay loose instead of fusing into one blob. */
  herdCrowdLimit: 5,
  /** How quickly a zombie turns toward where it wants to go, per second. Low = lumbering. */
  wanderTurnRate: 2.5,
  chaseTurnRate: 8,
  /** Hard cap on turning, radians/s, so the sprite never visibly snaps whatever the steering asks for. */
  maxTurnRate: 6,
  /**
   * Gait. Forward speed pulses once per step so zombies lurch rather than glide: 0 = constant velocity,
   * 1 = a full stall between pushes. The average over a step always equals the def speed.
   */
  shuffle: 0.5,
  /** Distance covered per step cycle, px. Shorter = busier steps. */
  stepLength: 30,
  /** Facing sway with each step, radians. Visual only. */
  sway: 0.06,
  /** Scale squash along the facing with each step, as a fraction. Visual only. */
  squash: 0.04,
  /**
   * Per-zombie variation rolled at spawn, as +/- fractions of the type's value, so a crowd of one
   * type never moves in lockstep: step cadence, sway amount and drawn size.
   */
  stepLengthJitter: 0.25,
  swayJitter: 0.5,
  sizeJitter: 0.07,
  /** +/- fraction of the type's shuffle, so some zombies lurch hard and others glide. */
  shuffleJitter: 0.5,
  /**
   * Each zombie's speed drifts slowly over time by up to this fraction, on its own period, so the
   * same zombie speeds up and slows down rather than holding one pace forever.
   */
  speedWobble: 0.15,
  speedWobblePeriodMin: 2.5,
  speedWobblePeriodMax: 6,
} satisfies Record<string, number>;

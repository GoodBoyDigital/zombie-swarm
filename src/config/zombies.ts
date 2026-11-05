import type { SfxName } from "../audio/Audio";
import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";

export interface ZombieArt {
  /** Sprite set in public/sprites: zombie-<key>.png and zombie-<key>-flash.png. */
  key: string;
  /** Lying-down poses, zombie-<key>-corpse-<n>.png; one is picked at random per death. */
  corpses: readonly number[];
  /** Body radius the sprites were drawn for, in world px once ART_SCALE is applied. The sprite is scaled by the def's radius over this. */
  radius: number;
  /** Where the body centre sits in the texture, as fractions; the arms reach ahead of it. */
  anchor: { x: number; y: number };
  /** Pieces a shot can take off. Types without parts never lose any. */
  parts?: Partial<Record<PartId, ZombiePart>>;
}

/** Severable pieces, in bit order of a zombie's missing-parts mask. */
export const PART_IDS = ["leftArm", "rightArm", "head"] as const;
export type PartId = (typeof PART_IDS)[number];

/**
 * An outline in a sprite's own pixels (the 2x source file): a polygon as flat x,y pairs, or a circle.
 * A polygon lists the edges where the part tears from the body first; `cut` counts them, and only
 * those get a stump. Its other edges run through empty space past the part's own outline.
 */
export type PartShape =
  | { poly: readonly number[]; cut: number }
  | { circle: readonly [x: number, y: number, r: number] };

export interface ZombiePart {
  /** Where the part sits on the standing body sprite; shots are tested against this. */
  body: PartShape;
  /** The same part on each corpse pose, ordered like `ZombieArt.corpses`. */
  corpses: readonly PartShape[];
  /** Losing this part leaves a neck stump instead of a torn edge: where it sits on the body and each corpse pose. */
  neck?: { body: NeckCap; corpses: readonly NeckCap[] };
  /**
   * Sprites thrown in place of the cut-out piece, one picked per detach, drawn upright with the
   * top of the part along the facing. A whole head with a face reads better than a cut-out disc.
   */
  pieces?: readonly string[];
}

/**
 * A neck stump in a sprite's source pixels. `back`, when set, first fills a disc of that radius with
 * the upper back: top-down, the head was hiding the shoulders.
 */
export interface NeckCap {
  x: number;
  y: number;
  r: number;
  back?: number;
}

/** Brain numbers a type may override; anything left out comes from ZOMBIE_AI. */
export type ZombieAiOverrides = Partial<
  Pick<
    typeof ZOMBIE_AI,
    | "aggroRadius"
    | "loseRadius"
    | "maxTurnRate"
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
  /** Multiplier on PLAYER.contactDamage while touching the player. */
  damageScale: number;
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
      // Faces right, so the left arm is the upper one. Outer edges run past the sprite so the torn
      // wobble never leaves slivers. Arms tear off at the sleeve; the head comes off whole and
      // leaves a neck stump. Corpse 1 lies face up head-left, 2 is curled, 3 face down.
      parts: {
        leftArm: {
          body: {
            poly: [60, 34, 52, 31, 46, 17, 46, -4, 96, -4, 96, 34],
            cut: 3,
          },
          corpses: [
            { poly: [62, 29, 50, 29, 40, 22, 40, -4, 82, -4, 80, 20], cut: 2 },
            { poly: [63, 22, 64, 45, 48, 47, 39, 28, 39, 2, 58, 2], cut: 2 },
            {
              poly: [98, 33, 88, 22, 70, 20, 70, -4, 124, -4, 124, 36],
              cut: 3,
            },
          ],
        },
        rightArm: {
          body: {
            poly: [60, 35, 52, 40, 46, 46, 46, 73, 96, 73, 96, 34],
            cut: 3,
          },
          corpses: [
            { poly: [34, 76, 58, 74, 72, 82, 74, 111, 34, 111], cut: 2 },
            { poly: [108, 46, 78, 46, 73, 22, 75, -4, 108, -4], cut: 3 },
            {
              poly: [70, 82, 70, 58, 86, 56, 96, 46, 124, 38, 124, 82],
              cut: 3,
            },
          ],
        },
        head: {
          body: { circle: [26, 31, 23] },
          corpses: [
            { circle: [21, 48, 27] },
            { circle: [21, 23, 25] },
            { circle: [79, 38, 20.5] },
          ],
          neck: {
            body: { x: 26, y: 31, r: 9, back: 22 },
            corpses: [
              { x: 44, y: 48, r: 8 },
              { x: 41, y: 39, r: 8 },
              { x: 61, y: 39, r: 8 },
            ],
          },
          pieces: [
            "/sprites/zombie-walker-head-1.png",
            "/sprites/zombie-walker-head-2.png",
          ],
        },
      },
    },
    radius: 12,
    speed: 34,
    speedVariance: 10,
    health: 3,
    knockbackScale: 1,
    mass: 1,
    color: 0xffffff,
    // Wander share raised so wandering stays near ~30 px/s while the chase got slower.
    ai: { wanderSpeedScale: 0.88 },
    groans: ["groan1", "groan2"],
    voicePitch: 1,
    lootScale: 1,
    damageScale: 1,
  },
  runner: {
    id: "runner",
    art: {
      key: "runner",
      corpses: [1, 2, 3],
      // Skinny top-down art with a trailing leg: torso centred 36% across, about 9 px radius.
      radius: 9,
      anchor: { x: 0.36, y: 0.47 },
    },
    radius: 10,
    speed: 85,
    speedVariance: 12,
    health: 2,
    knockbackScale: 1.4,
    mass: 0.6,
    color: 0xffffff,
    ai: {
      aggroRadius: 420,
      loseRadius: 600,
      // Commit to a charge: even up close, a missed pass needs a wide, slow turn.
      maxTurnRate: 0.5,
      wanderSpeedScale: 0.4,
      reactionDelayMin: 0.02,
      reactionDelayMax: 0.08,
      shuffle: 0.07,
      stepLength: 24,
      sway: 0.03,
      squash: 0.01,
    },
    groans: ["runnerShriek"],
    voicePitch: 1.15,
    lootScale: 1,
    damageScale: 0.6,
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
    speed: 24,
    speedVariance: 8,
    health: 12,
    knockbackScale: 0.25,
    mass: 4,
    color: 0xffffff,
    ai: {
      aggroRadius: 180,
      wanderSpeedScale: 0.7,
      shuffle: 0.42,
      stepLength: 56,
      sway: 0.09,
      squash: 0.025,
    },
    groans: ["bruteGroan"],
    voicePitch: 0.8,
    lootScale: 3,
    damageScale: 2.5,
  },
} as const satisfies Record<string, ZombieDef>;

export type ZombieId = keyof typeof ZOMBIES;

export const MAX_ZOMBIE_RADIUS = Math.max(
  ...Object.values(ZOMBIES).map((z) => z.radius),
);

/**
 * How fast zombies arrive, in spawns per second. Through the countdown the rate follows `curve`:
 * points over the run's progress (`at` 0 is the start, 1 is when the chopper is called) joined by
 * straight lines, so the swarm builds without the player noticing. The real crush is saved for the
 * finale: `inboundRate` while the chopper flies in and sets down, `landedRate` from touchdown until
 * the player boards. Levels scale every rate (`LevelDef.spawnRate`). `maxAlive` caps the horde.
 * Edit by hand or with the spawn curve editor; both keep this exact shape.
 */
export const SPAWN = {
  curve: [
    { at: 0, rate: 0.6 },
    { at: 0.36, rate: 0.8 },
    { at: 0.71, rate: 1.5 },
    { at: 1, rate: 3 },
  ],
  inboundRate: 4.5,
  landedRate: 5,
  maxAlive: 600,
};

/** Countdown spawn rate at `progress` (0..1) along `SPAWN.curve`, before the level's multiplier. */
export function countdownSpawnRate(progress: number): number {
  const { curve } = SPAWN;
  if (progress <= curve[0].at) return curve[0].rate;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (progress <= b.at)
      return (
        a.rate + ((b.rate - a.rate) * (progress - a.at)) / (b.at - a.at || 1)
      );
  }
  return curve[curve.length - 1].rate;
}

/**
 * What spawns when. Each row gives relative weights per type at `at`, a share of the run (0 at the
 * start, 1 when the chopper is called); weights are interpolated between rows and held flat after
 * the last one. Levels pull the rows earlier and weight brutes up. Runners are off for now.
 */
export const SPAWN_TABLE: readonly {
  at: number;
  weights: Record<ZombieId, number>;
}[] = [
  { at: 0, weights: { walker: 1, runner: 0, brute: 0 } },
  { at: 0.25, weights: { walker: 1, runner: 0, brute: 0 } },
  { at: 0.3, weights: { walker: 1, runner: 0, brute: 0.03 } },
  { at: 0.6, weights: { walker: 1, runner: 0, brute: 0.12 } },
  { at: 1, weights: { walker: 1, runner: 0, brute: 0.2 } },
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
  /** With this many zombies alive or fewer, every one of them shuffles toward the player wherever he is. */
  fewChaseAll: 4,
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
   * Zombies lumber: away from the player, turning is capped at this, radians/s, so they swing round
   * in wide arcs instead of pivoting on the spot. Applies to wandering and to distant chasers.
   */
  farMaxTurnRate: 1.2,
  /** Within this distance of the player a chaser turns at the full `maxTurnRate` to face them, px. */
  faceRadius: 80,
  /** Distance beyond `faceRadius` over which the turn cap blends from full back down to the far cap, px. */
  faceBlend: 80,
  /**
   * Gait. Forward speed pulses once per step so zombies lurch rather than glide: 0 = constant velocity,
   * 1 = a full stall between pushes. The average over a step always equals the def speed.
   */
  shuffle: 0.3,
  /** Distance covered per step cycle, px. Shorter = busier steps. */
  stepLength: 30,
  /** Facing sway with each step, radians. Visual only. */
  sway: 0.06,
  /** Scale squash along the facing with each step, as a fraction. Visual only. */
  squash: 0.02,
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

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, {
    ZOMBIES,
    SPAWN,
    SPAWN_TABLE,
    ZOMBIE_AI,
  });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

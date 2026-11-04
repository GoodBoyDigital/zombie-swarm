export interface ZombieDef {
  id: string;
  radius: number;
  /** Base move speed in px/s. Each instance gets +/- speedVariance. */
  speed: number;
  speedVariance: number;
  health: number;
  /** Multiplier applied to incoming knockback. 1 = normal, 0 = immovable. */
  knockbackScale: number;
  color: number;
}

/** How fast knockback bleeds off, per second. Shared by the living and by sliding bodies. */
export const KNOCKBACK_DRAG = 9;
/** Body radius the walker sprite was drawn at. Other sizes scale the same art. */
export const ZOMBIE_SPRITE_RADIUS = 12;
/** Where the body centre sits in the walker texture; the arms reach ahead of it. */
export const ZOMBIE_SPRITE_ANCHOR = { x: 0.25, y: 0.5 } as const;

export const ZOMBIES = {
  walker: {
    id: "walker",
    radius: 12,
    speed: 75,
    speedVariance: 25,
    health: 3,
    knockbackScale: 1,
    color: 0xffffff,
  },
} as const satisfies Record<string, ZombieDef>;

export type ZombieId = keyof typeof ZOMBIES;

export const MAX_ZOMBIE_RADIUS = Math.max(
  ...Object.values(ZOMBIES).map((z) => z.radius),
);

/**
 * Wander/chase tuning shared by every zombie. Kept flat and mutable so a tuning panel can bind straight to it.
 * Zombies wander until the player comes within `aggroRadius` or a gunshot's noise reaches them, then chase for good.
 */
export const ZOMBIE_AI = {
  /** Wander move speed as a fraction of the zombie's chase speed. */
  wanderSpeedScale: 0.55,
  /** Random drift of the wander heading, roughly radians per second. 0 = dead straight. */
  turnNoise: 0.7,
  /** Seconds between picking a new random wander point, min..max per zombie. */
  retargetIntervalMin: 2,
  retargetIntervalMax: 4,
  /** Distance at which a wanderer notices the player, px. */
  aggroRadius: 260,
  /** Seconds between noticing the player or a noise and starting to chase, min..max per zombie. */
  reactionDelayMin: 0.1,
  reactionDelayMax: 0.5,
  /** Pull toward the average position of nearby zombies while wandering. 0 = off. */
  herdCohesion: 0.5,
  /** Pull toward the average heading of nearby zombies while wandering. 0 = off. */
  herdAlignment: 0.8,
  /** How quickly a zombie turns toward where it wants to go, per second. Low = lumbering. */
  wanderTurnRate: 2.5,
  chaseTurnRate: 8,
} satisfies Record<string, number>;

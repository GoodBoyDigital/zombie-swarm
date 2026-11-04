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

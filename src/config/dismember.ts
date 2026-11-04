/**
 * Shooting pieces off zombies. Part shapes live on each type's art (`ZombieArt.parts`); this is
 * the shared feel: how often a hit on an attached part takes it off, and how the piece flies.
 */
export const DISMEMBER = {
  /** Chance a hit landing on an attached part tears it off, per part. */
  leftArmChance: 0.4,
  rightArmChance: 0.4,
  headChance: 0.25,
  /** Launch speed along the shot, px/s. */
  launchSpeedMin: 120,
  launchSpeedMax: 240,
  /** Random swing on the launch direction either side of the shot, radians. */
  launchSpread: 0.6,
  /** Share of the zombie's knockback velocity the piece carries away. */
  inheritKnockback: 0.5,
  /** Upward pop, px/s, before gravity pulls it down. */
  hopMin: 160,
  hopMax: 260,
  gravity: 900,
  /** Spin, radians/s, either direction. */
  spinMin: 3,
  spinMax: 8,
  /** Vertical speed kept per bounce; the horizontal and spin keep `bounceFriction`. */
  bounce: 0.35,
  bounceFriction: 0.55,
  /** Horizontal drag while sliding on the floor, per second. */
  floorDrag: 7,
  /** Pieces are drawn this much bigger than the body they came off, in flight and stamped, so they read on the floor. */
  pieceScale: 1.3,
  /** Blood sparks thrown from an arm stump. */
  spurt: 10,
  /** A decapitation: one big burst, then the neck pumps for a moment. */
  headSpurt: 28,
  headFountainSeconds: 0.35,
  headFountainRate: 90,
  /** A head pops this much higher and spins this much faster than an arm. */
  headHopScale: 1.6,
  headSpinScale: 1.8,
  /** Losing the head kills on the spot, whatever health is left. */
  headKills: true,
  /** Oldest pieces are stamped early if more than this are flying. */
  maxLive: 60,
} satisfies Record<string, number | boolean>;

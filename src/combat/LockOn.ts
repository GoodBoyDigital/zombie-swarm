import { CONTROLS } from "../config/controls";
import type { Horde } from "../entities/Horde";
import type { Zombie } from "../entities/Zombie";

/**
 * Candidates are ranked by angle off the stick first. Distance only separates zombies at similar
 * angles: one at full range scores as if it were this share of the cone further off the stick.
 */
const DISTANCE_WEIGHT = 0.3;
/** The zombie already locked keeps a head start, as a share of the cone, so a near-tie can't steal it. */
const KEEP_BONUS = 0.3;
/** ...and stays locked until it is this many cones off the stick. */
const KEEP_CONE = 1.25;

/**
 * Stick aiming's auto lock-on: the shot snaps onto the zombie that best matches where the stick
 * points, inside a cone and a range, and the lock is sticky so it doesn't flicker between two
 * zombies at similar angles. Thumbs aim worse than a mouse.
 */
export class LockOn {
  /** The zombie locked on to, or null when nothing is in the cone. */
  target: Zombie | null = null;
  /** Seconds the current target has been held. */
  private held = 0;

  /** Pick the target for a stick pointing along `angle` from (x, y). Returns it, or null to aim along the stick. */
  update(
    dt: number,
    horde: Horde,
    x: number,
    y: number,
    angle: number,
  ): Zombie | null {
    const current = this.target;
    let best: Zombie | null = null;
    let bestScore = Infinity;
    if (current && !current.dead) {
      const keep = score(current, x, y, angle, KEEP_CONE) - KEEP_BONUS;
      if (keep < Infinity) {
        // A fresh lock is held for a moment whatever else walks into the cone.
        this.held += dt;
        if (this.held < CONTROLS.lockOnHold) return current;
        best = current;
        bestScore = keep;
      }
    }
    const range = CONTROLS.lockOnRange;
    horde.hash.queryBox(x - range, y - range, x + range, y + range, (z) => {
      if (z === current || z.dead) return;
      const s = score(z, x, y, angle, 1);
      if (s >= bestScore) return;
      best = z;
      bestScore = s;
    });
    if (best !== current) this.held = 0;
    return (this.target = best);
  }

  clear(): void {
    this.target = null;
  }
}

/** Lower is better; Infinity outside the range or `slack` cones off the stick. */
function score(
  z: Zombie,
  x: number,
  y: number,
  angle: number,
  slack: number,
): number {
  const { lockOnCone: cone, lockOnRange: range } = CONTROLS;
  const dx = z.x - x;
  const dy = z.y - y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return Infinity;
  // Angle from the stick to the zombie, wrapped to -PI..PI.
  let off = Math.atan2(dy, dx) - angle;
  off = Math.abs(off - Math.PI * 2 * Math.round(off / (Math.PI * 2)));
  // Measured to its body, not its centre: every zombie the stick's line passes through is dead on,
  // so among those the nearest wins, which is the one a shot would hit first anyway.
  off = Math.max(0, off - Math.atan2(z.hitRadius, dist));
  if (off > cone * slack) return Infinity;
  return off / cone + (DISTANCE_WEIGHT * dist) / range;
}

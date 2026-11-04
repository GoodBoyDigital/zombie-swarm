import { ARENA } from "../config/arena";
import { ZOMBIE_AI } from "../config/zombies";
import { rand } from "../core/random";
import type { Zombie } from "./Zombie";

export type ZombieMode = "wander" | "chase";

/** Debug overlay switch (key V): wanderers tint blue, the player's aggro radius and gunshot noise are drawn. */
export const aiDebug = { enabled: false };

/** How far inside the walls wander points are picked, so herds don't grind along the edges. */
const WANDER_INSET = 80;
/** Close enough to a wander point to pick the next one. */
const ARRIVE_DIST = 24;

/**
 * Decision-making for one zombie: where it wants to go and how fast. Movement, health and art stay on the Zombie.
 * Fresh zombies wander. The player entering the aggro radius, or a gunshot's noise reaching them, alerts them;
 * after a short reaction delay they chase, and a chaser never goes back to wandering.
 */
export class ZombieBrain {
  mode: ZombieMode = "wander";
  private targetX = 0;
  private targetY = 0;
  private retargetIn = 0;
  /** Seconds left before an alert becomes a chase; negative when nothing has been noticed yet. */
  private reactIn = -1;
  /** Neighbour sums filled by the horde's crowd query each frame, consumed on the next steer. */
  herdCount = 0;
  herdX = 0;
  herdY = 0;
  herdCos = 0;
  herdSin = 0;

  reset(): void {
    this.mode = "wander";
    this.retargetIn = 0;
    this.reactIn = -1;
    this.clearHerd();
  }

  get wandering(): boolean {
    return this.mode === "wander";
  }

  /** Something caught this zombie's attention. The chase starts after its reaction delay. */
  alert(): void {
    if (this.mode === "chase" || this.reactIn >= 0) return;
    this.reactIn = rand(ZOMBIE_AI.reactionDelayMin, ZOMBIE_AI.reactionDelayMax);
  }

  /** Turns the zombie toward where it wants to go and returns its move speed for this frame, px/s. */
  steer(
    dt: number,
    z: Zombie,
    playerX: number,
    playerY: number,
    playerRadius: number,
  ): number {
    const ai = ZOMBIE_AI;
    if (this.reactIn >= 0) {
      this.reactIn -= dt;
      if (this.reactIn < 0) this.mode = "chase";
    }
    const px = playerX - z.x;
    const py = playerY - z.y;
    if (
      this.mode === "wander" &&
      px * px + py * py < ai.aggroRadius * ai.aggroRadius
    )
      this.alert();

    // Still in the gate corridor: head for the entry point whatever the mood.
    if (!z.entered) {
      turnToward(
        z,
        z.gate.entry.x - z.x,
        z.gate.entry.y - z.y,
        ai.chaseTurnRate,
        dt,
      );
      return z.speed;
    }

    if (this.mode === "chase") {
      turnToward(z, px, py, ai.chaseTurnRate, dt);
      // Slow to a stop when touching the player instead of overlapping them.
      const stopAt = z.def.radius + playerRadius;
      return px * px + py * py > stopAt * stopAt ? z.speed : 0;
    }

    this.retargetIn -= dt;
    let tx = this.targetX - z.x;
    let ty = this.targetY - z.y;
    if (this.retargetIn <= 0 || tx * tx + ty * ty < ARRIVE_DIST * ARRIVE_DIST) {
      const heading = rand(0, Math.PI * 2);
      const leg = rand(ai.wanderLegMin, ai.wanderLegMax);
      this.targetX = clamp(
        z.x + Math.cos(heading) * leg,
        WANDER_INSET,
        ARENA.width - WANDER_INSET,
      );
      this.targetY = clamp(
        z.y + Math.sin(heading) * leg,
        WANDER_INSET,
        ARENA.height - WANDER_INSET,
      );
      this.retargetIn = rand(ai.retargetIntervalMin, ai.retargetIntervalMax);
      tx = this.targetX - z.x;
      ty = this.targetY - z.y;
    }
    const td = Math.hypot(tx, ty) || 1;
    let vx = tx / td;
    let vy = ty / td;

    // Loose herding: lean toward the neighbours' centre and share their heading. Cohesion fades as the
    // zombie gets crowded, otherwise a few hundred wanderers pull themselves into a single clump.
    if (this.herdCount > 0) {
      const inv = 1 / this.herdCount;
      const cx = this.herdX * inv - z.x;
      const cy = this.herdY * inv - z.y;
      const cd = Math.hypot(cx, cy) || 1;
      const cohesion =
        ai.herdCohesion * Math.max(0, 1 - this.herdCount / ai.herdCrowdLimit);
      vx += (cx / cd) * cohesion + this.herdCos * inv * ai.herdAlignment;
      vy += (cy / cd) * cohesion + this.herdSin * inv * ai.herdAlignment;
      this.clearHerd();
    }

    turnToward(z, vx, vy, ai.wanderTurnRate, dt);
    // Random walk on the heading; sqrt(dt) keeps the drift rate independent of frame rate.
    z.facing += rand(-1, 1) * ai.turnNoise * Math.sqrt(3 * dt);
    return z.speed * ai.wanderSpeedScale;
  }

  private clearHerd(): void {
    this.herdCount = 0;
    this.herdX = 0;
    this.herdY = 0;
    this.herdCos = 0;
    this.herdSin = 0;
  }
}

/** Ease the facing toward a direction vector rather than snapping, so direction changes read as lumbering. */
function turnToward(
  z: Zombie,
  dx: number,
  dy: number,
  rate: number,
  dt: number,
): void {
  let turn = Math.atan2(dy, dx) - z.facing;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  z.facing += turn * Math.min(1, dt * rate);
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

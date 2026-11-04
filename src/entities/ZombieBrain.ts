import { ARENA } from "../config/arena";
import { ZOMBIE_AI } from "../config/zombies";
import { rand } from "../core/random";
import type { Zombie } from "./Zombie";

export type ZombieMode = "wander" | "chase";

/** Debug overlay switch (key V): state tints, the player's aggro and lose radii, and gunshot noise rings. */
export const aiDebug = { enabled: false };

/** How far inside the walls wander points are picked, so herds don't grind along the edges. */
const WANDER_INSET = 80;
/** Close enough to a wander point to pick the next one. */
const ARRIVE_DIST = 24;
/** Seconds between picking a new random turn rate while wandering, and how fast the current one eases to it. */
const DRIFT_RETARGET_MIN = 0.3;
const DRIFT_RETARGET_MAX = 0.8;
const DRIFT_EASE = 4;
/** When a chaser gives up, its first wander leg stays within this of its current heading so nothing snaps. */
const RESUME_SPREAD = 0.5;

/**
 * Decision-making for one zombie: where it wants to go and how fast. Movement, health and art stay on the Zombie.
 * Fresh zombies wander. The player entering the aggro radius, or a gunshot's noise reaching them, alerts them;
 * after a short reaction delay they chase. A chaser loses interest once the player has been outside the lose
 * radius, with no noise arriving, for its lose-interest time, and drifts back into wandering.
 */
export class ZombieBrain {
  mode: ZombieMode = "wander";
  private targetX = 0;
  private targetY = 0;
  private retargetIn = 0;
  /** Seconds left before an alert becomes a chase; negative when nothing has been noticed yet. */
  private reactIn = -1;
  /** Seconds since the player was last within loseRadius or a noise arrived. Only meaningful while chasing. */
  private sinceContact = 0;
  /** This zombie's own lose-interest time, jittered so a crowd doesn't give up in unison. */
  private loseAfter = 0;
  /** Current and target random turn rate while wandering, radians/s. */
  private drift = 0;
  private driftTarget = 0;
  private driftIn = 0;
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
    this.sinceContact = 0;
    this.loseAfter =
      ZOMBIE_AI.loseInterestSeconds +
      rand(-ZOMBIE_AI.loseInterestJitter, ZOMBIE_AI.loseInterestJitter);
    this.drift = 0;
    this.driftTarget = 0;
    this.driftIn = 0;
    this.clearHerd();
  }

  get wandering(): boolean {
    return this.mode === "wander";
  }

  /** Chasing, but the player has slipped away and the give-up timer is running. */
  get losingInterest(): boolean {
    return this.mode === "chase" && this.sinceContact > 0;
  }

  /** Something caught this zombie's attention: a chaser stays keen, a wanderer starts its reaction delay. */
  alert(): void {
    if (this.mode === "chase") {
      this.sinceContact = 0;
      return;
    }
    if (this.reactIn < 0)
      this.reactIn = rand(
        ZOMBIE_AI.reactionDelayMin,
        ZOMBIE_AI.reactionDelayMax,
      );
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
      if (this.reactIn < 0) {
        this.mode = "chase";
        this.sinceContact = 0;
      }
    }
    const px = playerX - z.x;
    const py = playerY - z.y;
    const playerDist2 = px * px + py * py;
    if (this.mode === "wander" && playerDist2 < ai.aggroRadius * ai.aggroRadius)
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
      if (playerDist2 < ai.loseRadius * ai.loseRadius) this.sinceContact = 0;
      else this.sinceContact += dt;
      if (this.sinceContact > this.loseAfter) {
        this.mode = "wander";
        this.sinceContact = 0;
        this.pickLeg(z, z.facing + rand(-RESUME_SPREAD, RESUME_SPREAD));
      } else {
        turnToward(z, px, py, ai.chaseTurnRate, dt);
        // Slow to a stop when touching the player instead of overlapping them.
        const stopAt = z.def.radius + playerRadius;
        return playerDist2 > stopAt * stopAt ? z.speed : 0;
      }
    }

    this.retargetIn -= dt;
    let tx = this.targetX - z.x;
    let ty = this.targetY - z.y;
    if (this.retargetIn <= 0 || tx * tx + ty * ty < ARRIVE_DIST * ARRIVE_DIST) {
      this.pickLeg(z, rand(0, Math.PI * 2));
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
    // Meander: a random turn rate that itself drifts slowly. Fresh noise every frame made the sprite twitch.
    this.driftIn -= dt;
    if (this.driftIn <= 0) {
      this.driftTarget = rand(-ai.turnNoise, ai.turnNoise);
      this.driftIn = rand(DRIFT_RETARGET_MIN, DRIFT_RETARGET_MAX);
    }
    this.drift +=
      (this.driftTarget - this.drift) * Math.min(1, dt * DRIFT_EASE);
    z.facing += this.drift * dt;
    return z.speed * ai.wanderSpeedScale;
  }

  /** Start a new wander leg in the given direction, clamped inside the arena. */
  private pickLeg(z: Zombie, heading: number): void {
    const ai = ZOMBIE_AI;
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
  }

  private clearHerd(): void {
    this.herdCount = 0;
    this.herdX = 0;
    this.herdY = 0;
    this.herdCos = 0;
    this.herdSin = 0;
  }
}

/** Ease the facing toward a direction vector, capped at maxTurnRate so direction changes never snap. */
function turnToward(
  z: Zombie,
  dx: number,
  dy: number,
  rate: number,
  dt: number,
): void {
  let turn = Math.atan2(dy, dx) - z.facing;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const maxTurn = ZOMBIE_AI.maxTurnRate * dt;
  z.facing += clamp(turn * Math.min(1, dt * rate), -maxTurn, maxTurn);
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

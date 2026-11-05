import { MAX_ZOMBIE_RADIUS } from "../config/zombies";
import { rand } from "../core/random";
import type { Zombie } from "../entities/Zombie";
import { wallHit } from "../world/walls";
import type { CombatContext } from "./CombatContext";
import type { ShotHandler } from "./shots";

/** Bolt colour (it gets a white core), and the sparks thrown off each zombie it strikes. */
const BOLT = 0x4aa8ff;
const SPARK = 0xbfe8ff;
const SPARKS_PER_HIT = 4;
/** Bolts hold a touch longer than the magnet's flicker so a chain reads end to end. */
const BOLT_SECONDS = 0.14;
const BOLT_KINK = 14;
const BOLT_JITTER = 12;
/** Muzzle crackle: little arcs off the prongs, px long. */
const CRACKLE_ARCS = 3;
const CRACKLE_REACH = 11;
/** With nothing in the cone, the bolt fizzles out this share of the range. */
const FIZZLE_MIN = 0.35;
const FIZZLE_MAX = 0.7;

/** Zombies struck by the current shot, in order; reused between shots. */
const chain: Zombie[] = [];

/** Nearest living zombie to (x, y) within `reach` that `accept` lets through. */
function nearest(
  ctx: CombatContext,
  x: number,
  y: number,
  reach: number,
  accept: (z: Zombie, dx: number, dy: number, d: number) => boolean,
): Zombie | null {
  let best: Zombie | null = null;
  let bestD = Infinity;
  const pad = reach + MAX_ZOMBIE_RADIUS;
  ctx.horde.hash.queryBox(x - pad, y - pad, x + pad, y + pad, (z) => {
    if (z.dead) return;
    const dx = z.x - x;
    const dy = z.y - y;
    const d = Math.hypot(dx, dy);
    if (d - z.def.radius > reach || d >= bestD || !accept(z, dx, dy, d)) return;
    best = z;
    bestD = d;
  });
  return best;
}

/**
 * Chain lightning: strike the nearest zombie in a narrow cone along the aim, then jump to the
 * nearest one not yet struck, again and again, losing damage on every jump. Instant, so no update.
 */
export const tesla: ShotHandler = {
  ownMuzzle: true,
  fire(ctx, def, ox, oy, dirX, dirY) {
    const t = def.tesla;
    if (!t) return;
    for (let i = 0; i < CRACKLE_ARCS; i++) {
      const a = Math.atan2(dirY, dirX) + rand(-1.4, 1.4);
      const r = rand(0.5, 1) * CRACKLE_REACH;
      ctx.fx.zap(ox, oy, ox + Math.cos(a) * r, oy + Math.sin(a) * r, BOLT, {
        width: 1.6,
        life: 0.06,
      });
    }
    ctx.fx.sparkle(ox, oy, SPARK, 3);

    const wall = wallHit(ox, oy, dirX, dirY);
    const range = wall ? Math.min(def.range, wall.t) : def.range;
    const cosCone = Math.cos(t.cone);
    let z = nearest(
      ctx,
      ox,
      oy,
      range,
      // Point blank counts whatever the angle: the prongs are inside it.
      (zz, dx, dy, d) =>
        d <= zz.def.radius || (dx * dirX + dy * dirY) / d >= cosCone,
    );
    if (!z) {
      const a = Math.atan2(dirY, dirX) + rand(-t.cone, t.cone) * 0.5;
      const reach = range * rand(FIZZLE_MIN, FIZZLE_MAX);
      ctx.fx.zap(
        ox,
        oy,
        ox + Math.cos(a) * reach,
        oy + Math.sin(a) * reach,
        BOLT,
        {
          width: 2,
          life: 0.07,
          kinkEvery: BOLT_KINK,
          jitter: BOLT_JITTER,
        },
      );
      return;
    }

    chain.length = 0;
    let fromX = ox;
    let fromY = oy;
    let damage = def.damage;
    for (let i = 0; z && i <= t.jumps; i++) {
      chain.push(z);
      const { x, y } = z;
      const len = Math.hypot(x - fromX, y - fromY) || 1;
      const ux = (x - fromX) / len;
      const uy = (y - fromY) / len;
      // Thick and bright off the gun, thinning down the chain with the damage.
      const strength = damage / def.damage;
      ctx.fx.zap(fromX, fromY, x, y, BOLT, {
        width: 2.4 + 3 * strength,
        life: BOLT_SECONDS,
        kinkEvery: BOLT_KINK,
        jitter: BOLT_JITTER,
        glow: true,
        ink: true,
      });
      ctx.fx.sparkle(x, y, SPARK, SPARKS_PER_HIT);
      z.stun(t.stun);
      const r = z.def.radius;
      ctx.applyHit(z, x - ux * r, y - uy * r, ux, uy, damage, def.knockback);
      fromX = x;
      fromY = y;
      damage *= t.falloff;
      z = nearest(ctx, x, y, t.jumpRadius, (zz) => !chain.includes(zz));
    }
  },
};

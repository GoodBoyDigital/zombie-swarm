import { MAX_ZOMBIE_RADIUS } from "../config/zombies";
import type { SpatialHash } from "../core/SpatialHash";
import type { Zombie } from "../entities/Zombie";

export interface RayHit {
  zombie: Zombie;
  /** Distance along the ray from its origin. */
  t: number;
  x: number;
  y: number;
}

/**
 * Hitscan against every zombie near the segment, nearest first.
 * `maxHits` caps how many are returned; pass Infinity for piercing weapons.
 */
export function raycastZombies(
  hash: SpatialHash<Zombie>,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  range: number,
  maxHits: number,
): RayHit[] {
  const ex = ox + dirX * range;
  const ey = oy + dirY * range;
  const pad = MAX_ZOMBIE_RADIUS;
  const hits: RayHit[] = [];

  hash.queryBox(
    Math.min(ox, ex) - pad,
    Math.min(oy, ey) - pad,
    Math.max(ox, ex) + pad,
    Math.max(oy, ey) + pad,
    (z) => {
      // Project the circle centre onto the ray; reject if it's behind us or too far from the line.
      if (z.dead) return;
      const rx = z.x - ox;
      const ry = z.y - oy;
      const r = z.def.radius;
      const along = rx * dirX + ry * dirY;
      if (along > range + r) return;
      // Behind the muzzle only counts if the muzzle is actually inside the zombie.
      if (along < 0 && rx * rx + ry * ry > r * r) return;
      const perp = rx * dirY - ry * dirX;
      if (perp * perp > r * r) return;
      const t = Math.max(0, along - Math.sqrt(r * r - perp * perp));
      if (t > range) return;
      hits.push({ zombie: z, t, x: ox + dirX * t, y: oy + dirY * t });
    },
  );

  hits.sort((a, b) => a.t - b.t);
  if (hits.length > maxHits) hits.length = maxHits;
  return hits;
}

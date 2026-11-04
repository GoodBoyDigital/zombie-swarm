import { ARENA, GATES, type Side } from "../config/arena";

/** Where a ray from inside the arena meets a wall: distance along the ray and the wall's inward normal. */
export interface WallHit {
  t: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

const OPEN = new Set<Side>(GATES);

/**
 * First wall a ray from (ox, oy) along a unit direction meets, or null if it leaves through a gate
 * (the arena is open there) or starts outside the walls. Walls are the arena's edges minus the gates.
 */
export function wallHit(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
): WallHit | null {
  const { width: w, height: h, gateWidth } = ARENA;
  if (ox < 0 || oy < 0 || ox > w || oy > h) return null;
  const tx = dx > 0 ? (w - ox) / dx : dx < 0 ? -ox / dx : Infinity;
  const ty = dy > 0 ? (h - oy) / dy : dy < 0 ? -oy / dy : Infinity;
  const half = gateWidth / 2;
  if (tx < ty) {
    const y = oy + dy * tx;
    const side: Side = dx > 0 ? "right" : "left";
    if (OPEN.has(side) && Math.abs(y - h / 2) < half) return null;
    return { t: tx, x: dx > 0 ? w : 0, y, nx: dx > 0 ? -1 : 1, ny: 0 };
  }
  const x = ox + dx * ty;
  const side: Side = dy > 0 ? "bottom" : "top";
  if (OPEN.has(side) && Math.abs(x - w / 2) < half) return null;
  return { t: ty, x, y: dy > 0 ? h : 0, nx: 0, ny: dy > 0 ? -1 : 1 };
}

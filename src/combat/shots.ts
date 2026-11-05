import { wallHit } from "../world/walls";
import type { WeaponDef } from "../config/weapons";
import type { CombatContext } from "./CombatContext";
import { rocket } from "./rocket";
import { raycastZombies } from "./raycast";
import { saw } from "./saw";
import { sonic } from "./sonic";
import { tesla } from "./tesla";

/** Each shot type owns how its pellets reach their targets. */
export type ShotType = "hitscan" | "rocket" | "tesla" | "saw" | "sonic";

export interface ShotHandler {
  /** Launch one pellet from the muzzle along a unit direction. Called `def.pellets` times per pull. */
  fire(
    ctx: CombatContext,
    def: WeaponDef,
    ox: number,
    oy: number,
    dirX: number,
    dirY: number,
  ): void;
  /** Projectile types move their bodies and detonate here (`explode` on impact); instant types leave it out. */
  update?(ctx: CombatContext, dt: number): void;
  /** Draws its own muzzle effect, or none: the weapon skips the shared muzzle flash. */
  ownMuzzle?: boolean;
  /** Melee: fired from the player's centre instead of the muzzle. */
  fromBody?: boolean;
}

const hitscan: ShotHandler = {
  fire(ctx, def, ox, oy, dirX, dirY) {
    // Walls are solid: nothing past them can be hit, and the line ends on the wall.
    const wall = wallHit(ox, oy, dirX, dirY);
    const range = wall ? Math.min(def.range, wall.t) : def.range;
    const hits = raycastZombies(
      ctx.horde.hash,
      ox,
      oy,
      dirX,
      dirY,
      range,
      def.pierce,
    );
    // The tracer stops at the zombie that absorbed the shot; a piercing shot carries on through.
    const stoppedBy = hits.length >= def.pierce ? hits[hits.length - 1] : null;
    const endX = stoppedBy ? stoppedBy.x : ox + dirX * range;
    const endY = stoppedBy ? stoppedBy.y : oy + dirY * range;
    if (!stoppedBy && wall && wall.t <= def.range) {
      ctx.fx.wallDebris(wall.x, wall.y, dirX, dirY, wall.nx, wall.ny);
      ctx.floor.chipWall(wall.x, wall.y, wall.nx, wall.ny);
      ctx.casings.wallChunk(wall.x, wall.y, wall.nx, wall.ny);
    }
    if (def.beam === "rail") {
      ctx.fx.railBeam(ox, oy, endX, endY, hits);
      ctx.floor.railScorch(ox, oy, endX, endY);
    } else ctx.fx.tracer(ox, oy, endX, endY, def.tracerWidth, ctx.shotPower);
    for (const hit of hits)
      ctx.applyHit(
        hit.zombie,
        hit.x,
        hit.y,
        dirX,
        dirY,
        def.damage,
        def.knockback,
      );
  },
};

export const SHOT_HANDLERS: Record<ShotType, ShotHandler> = {
  hitscan,
  rocket,
  tesla,
  saw,
  sonic,
};

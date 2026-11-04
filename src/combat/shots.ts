import type { WeaponDef } from "../config/weapons";
import type { CombatContext } from "./CombatContext";
import { rocket } from "./rocket";
import { raycastZombies } from "./raycast";

/** Each shot type owns how its pellets reach their targets. */
export type ShotType = "hitscan" | "rocket";

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
}

const hitscan: ShotHandler = {
  fire(ctx, def, ox, oy, dirX, dirY) {
    const hits = raycastZombies(
      ctx.horde.hash,
      ox,
      oy,
      dirX,
      dirY,
      def.range,
      def.pierce,
    );
    // The tracer stops at the zombie that absorbed the shot; a piercing shot carries on through.
    const stoppedBy = hits.length >= def.pierce ? hits[hits.length - 1] : null;
    const endX = stoppedBy ? stoppedBy.x : ox + dirX * def.range;
    const endY = stoppedBy ? stoppedBy.y : oy + dirY * def.range;
    ctx.fx.tracer(ox, oy, endX, endY, def.tracerWidth, ctx.shotPower);
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

export const SHOT_HANDLERS: Record<ShotType, ShotHandler> = { hitscan, rocket };

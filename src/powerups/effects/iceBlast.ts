import type { EffectDef } from "../../config/powerups";
import { rand } from "../../core/random";
import type { Zombie } from "../../entities/Zombie";
import type { PowerupEffect } from "../PowerupContext";

/** How the shove fades toward the edge: 0 = flat across the radius, 1 = zero at the edge. */
const KNOCKBACK_FALLOFF = 0.5;

/** Zombies in the blast, collected first: blast damage can kill and release them mid-query. */
const caught: Zombie[] = [];

/**
 * A burst of cold at the pickup point: everything in the radius is frozen solid in a block of ice
 * (src/fx/Ice.ts) until it thaws, shattering at the first hit meanwhile. White-blue flash, crystal
 * burst, frost ring, and frost stamped into the floor. Its pickup sound is the blast.
 */
export const iceBlast: PowerupEffect<EffectDef<"iceBlast">> = {
  start(ctx, def, active) {
    const { x, y } = active.origin;
    const r = def.radius;
    ctx.beginVolley();
    caught.length = 0;
    ctx.horde.hash.queryBox(x - r, y - r, x + r, y + r, (z) => {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 <= r * r) caught.push(z);
    });
    for (const z of caught) {
      const d = Math.hypot(z.x - x, z.y - y);
      // Dead centre has no direction of its own; throw it any way.
      const a = d > 0 ? Math.atan2(z.y - y, z.x - x) : rand(0, Math.PI * 2);
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);
      // Hurt before freezing: a frozen zombie would shatter at any damage.
      if (def.blastDamage > 0) {
        ctx.applyHit(z, z.x, z.y, dirX, dirY, def.blastDamage, 0);
        if (z.dead) continue;
      }
      ctx.horde.ice.freeze(
        z,
        def.freezeSeconds,
        def.thawWarningSeconds,
        dirX,
        dirY,
        def.knockback * (1 - (KNOCKBACK_FALLOFF * d) / r),
      );
    }
    caught.length = 0;
    ctx.fx.frostBlast(x, y, r, def.blastSeconds, def.crystals);
    if (def.frostMark > 0) ctx.floor.frost(x, y, r * def.frostMark);
    ctx.camera.addTrauma(def.shake);
  },
};

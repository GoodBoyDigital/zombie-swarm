import { MAX_ZOMBIE_RADIUS } from "../config/zombies";
import { pick } from "../core/random";
import type { Zombie } from "../entities/Zombie";
import { BLOOD_SPRAY } from "./CombatContext";
import type { ShotHandler } from "./shots";

/** Zombies in the arc this tick; reused between ticks. */
const cut: Zombie[] = [];

/**
 * Melee: every tick of held trigger carves everything in an arc in front of the player. Spray and
 * chunks leave sideways off the chain, the side each zombie is on. Fired from the player's centre.
 */
export const saw: ShotHandler = {
  ownMuzzle: true,
  fromBody: true,
  fire(ctx, def, ox, oy, dirX, dirY) {
    const s = def.saw;
    if (!s) return;
    const reach = def.range;
    const cosArc = Math.cos(s.arc);
    const pad = reach + MAX_ZOMBIE_RADIUS;
    cut.length = 0;
    ctx.horde.hash.queryBox(ox - pad, oy - pad, ox + pad, oy + pad, (z) => {
      if (z.dead) return;
      const dx = z.x - ox;
      const dy = z.y - oy;
      const d = Math.hypot(dx, dy);
      if (d - z.def.radius > reach) return;
      if (d > z.def.radius && (dx * dirX + dy * dirY) / d < cosArc) return;
      cut.push(z);
    });
    if (cut.length === 0) return;

    for (const z of cut) {
      const dx = z.x - ox;
      const dy = z.y - oy;
      const d = Math.hypot(dx, dy) || 1;
      // Where the bar meets the body: the nearest point on the bar to its centre.
      const along = Math.min(reach, Math.max(0, dx * dirX + dy * dirY));
      const hx = ox + dirX * along;
      const hy = oy + dirY * along;
      // The chain throws to whichever side of the bar the body is on, and a little forward.
      const side = dx * dirY - dy * dirX > 0 ? 1 : -1;
      const sx = dirY * side + dirX * 0.35;
      const sy = -dirX * side + dirY * 0.35;
      z.stun(def.fireInterval * 2);
      ctx.fx.bloodBurst(hx, hy, sx, sy, s.spray, BLOOD_SPRAY);
      ctx.fx.gore(hx, hy, sx, sy, s.chunks);
      ctx.applyHit(z, hx, hy, dx / d, dy / d, def.damage, def.knockback);
    }
    for (let i = 0; i < s.splats; i++) {
      const z = pick(cut);
      const side = (z.x - ox) * dirY - (z.y - oy) * dirX > 0 ? 1 : -1;
      ctx.horde.splat(z.x, z.y, dirY * side, -dirX * side);
    }
    ctx.camera.addTrauma(s.cutShake);
  },
};

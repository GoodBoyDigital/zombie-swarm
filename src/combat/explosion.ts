import type { ExplosionDef } from "../config/explosions";
import { rand } from "../core/random";
import type { CombatContext } from "./CombatContext";

/**
 * Set off one blast at a world point: damage and knockback radiating out to every zombie in the
 * radius (kills go through applyHit, so bodies slide and loot drops), then the fireball, shockwave,
 * debris, scorch mark, shake, noise and sound. A rocket calls this on impact, the nuke once,
 * an airstrike once per bomb.
 */
export function explode(
  ctx: CombatContext,
  x: number,
  y: number,
  def: ExplosionDef,
): void {
  ctx.beginVolley();
  const r = def.radius;
  if (def.damage > 0 || def.knockback > 0) {
    ctx.horde.hash.queryBox(x - r, y - r, x + r, y + r, (z) => {
      if (z.dead) return;
      const dx = z.x - x;
      const dy = z.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) return;
      const d = Math.sqrt(d2);
      // Dead centre has no direction of its own; throw it any way.
      const a = d > 0 ? Math.atan2(dy, dx) : rand(0, Math.PI * 2);
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);
      const f = 1 - (def.falloff * d) / r;
      if (def.damage > 0)
        ctx.applyHit(
          z,
          z.x,
          z.y,
          dirX,
          dirY,
          def.damage * f,
          def.knockback * f,
        );
      else z.push(dirX, dirY, def.knockback * f);
    });
  }
  ctx.fx.explosion(x, y, def);
  if (def.scorch > 0)
    ctx.floor.scorch(x, y, (def.visualRadius ?? r) * def.scorch);
  ctx.camera.addTrauma(def.shake, Math.max(1, def.shake));
  if (def.noiseRadius > 0) ctx.horde.noise(x, y, def.noiseRadius);
  ctx.audio.play(def.sound, {
    volume: def.volume,
    pitch: def.pitch * rand(0.95, 1.05),
  });
}

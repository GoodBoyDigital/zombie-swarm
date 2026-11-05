import { Container, Graphics } from "pixi.js";
import type { WeaponDef } from "../config/weapons";
import { MAX_ZOMBIE_RADIUS } from "../config/zombies";
import { rand } from "../core/random";
import type { Zombie } from "../entities/Zombie";
import type { CombatContext } from "./CombatContext";
import type { ShotHandler } from "./shots";

/** Rings per wave, the gap between them, px, and their colour, bright front first. */
const RINGS = 3;
const RING_GAP = 15;
const RING_COLOR = 0xdff6ff;
/** A darker band just behind each ring, so the air reads as pressed. */
const SHADE_COLOR = 0x1d2a30;
/** Points per ring, how far it ripples in and out, px, and how fast. */
const RING_POINTS = 24;
const RIPPLE = 2.5;
const RIPPLE_SPEED = 26;
/** The wave leaves the player's body already this wide, px, so whatever is pressed against him is shoved too. */
const START_RADIUS = 16;
/** Dust kicked up along the front every this many px it travels, and puffs off each zombie it shoves. */
const DUST_STEP = 28;
const DUST_PER_ZOMBIE = 2;

interface Wave {
  view: Graphics;
  x: number;
  y: number;
  angle: number;
  /** Front radius now, px. */
  r: number;
  age: number;
  dustLeft: number;
  /** Zombies this wave has already shoved, so each gets one push. */
  hit: Set<Zombie>;
  def: WeaponDef;
  /** The weapon's power-up damage and its own dismember rate, captured at the trigger pull. */
  damageScale: number;
  dismemberScale: number;
}

/** Each weapon context owns its waves, like the rockets. */
class Waves {
  readonly view = new Container({ label: "sonicWaves" });
  readonly live: Wave[] = [];
  readonly pool: Wave[] = [];

  update(ctx: CombatContext, dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const w = this.live[i];
      const s = w.def.sonic;
      const range = w.def.range;
      if (!s || w.r >= range) {
        w.view.removeFromParent();
        w.hit.clear();
        this.live.splice(i, 1);
        this.pool.push(w);
        continue;
      }
      const prev = w.r;
      w.r = Math.min(range, w.r + s.speed * dt);
      w.age += dt;
      this.shove(ctx, w, prev);
      this.kickDust(ctx, w, w.r - prev);
      this.draw(w);
    }
  }

  /** Everything the front swept over this frame, inside the cone, gets its one push. */
  private shove(ctx: CombatContext, w: Wave, prev: number): void {
    const s = w.def.sonic;
    if (!s) return;
    const { x, y, r } = w;
    const cosArc = Math.cos(s.arc);
    const ax = Math.cos(w.angle);
    const ay = Math.sin(w.angle);
    const pad = r + MAX_ZOMBIE_RADIUS;
    const scale = ctx.damageScale;
    const dismember = ctx.dismemberScale;
    ctx.damageScale = w.damageScale;
    ctx.dismemberScale = w.dismemberScale;
    ctx.horde.hash.queryBox(x - pad, y - pad, x + pad, y + pad, (z) => {
      if (z.dead || w.hit.has(z)) return;
      const dx = z.x - x;
      const dy = z.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const zr = z.def.radius;
      if (d - zr > r || d + zr < prev) return;
      if ((dx * ax + dy * ay) / d < cosArc) return;
      w.hit.add(z);
      const ux = dx / d;
      const uy = dy / d;
      const f = Math.max(0, 1 - (s.falloff * d) / w.def.range);
      z.stagger(s.stun * f);
      z.tumble(s.tumble * f * (Math.random() < 0.5 ? -1 : 1));
      ctx.fx.dust(z.x, z.y, ux, uy, DUST_PER_ZOMBIE);
      ctx.applyHit(
        z,
        z.x - ux * zr,
        z.y - uy * zr,
        ux,
        uy,
        w.def.damage * f,
        w.def.knockback * f,
      );
    });
    ctx.damageScale = scale;
    ctx.dismemberScale = dismember;
  }

  /** Puffs of floor dust at random points along the front, spaced by distance travelled. */
  private kickDust(ctx: CombatContext, w: Wave, travel: number): void {
    const s = w.def.sonic;
    if (!s) return;
    w.dustLeft -= travel;
    for (; w.dustLeft <= 0; w.dustLeft += DUST_STEP) {
      const a = w.angle + rand(-s.arc, s.arc);
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      ctx.fx.dust(w.x + ux * w.r, w.y + uy * w.r, ux, uy, 1);
    }
  }

  /** Concentric rippling arcs, each with a dark band behind it, fading as the wave runs out. */
  private draw(w: Wave): void {
    const s = w.def.sonic;
    if (!s) return;
    const g = w.view.clear();
    const life = 1 - w.r / w.def.range;
    for (let k = 0; k < RINGS; k++) {
      const rr = w.r - k * RING_GAP;
      if (rr <= 4) continue;
      const fade = life * (1 - k / RINGS);
      // A broad soft band of pressed air, a dark trough behind it, then the bright crest.
      if (k === 0) {
        this.arc(g, w, rr - 8, s.arc, k);
        g.stroke({ width: 18, color: RING_COLOR, alpha: 0.14 * fade });
      }
      this.arc(g, w, rr - 4, s.arc, k);
      g.stroke({ width: 5 - k, color: SHADE_COLOR, alpha: 0.35 * fade });
      this.arc(g, w, rr, s.arc, k);
      g.stroke({ width: 7 - k * 1.8, color: RING_COLOR, alpha: 0.95 * fade });
    }
  }

  private arc(g: Graphics, w: Wave, r: number, half: number, k: number): void {
    for (let i = 0; i <= RING_POINTS; i++) {
      const u = i / RING_POINTS;
      const a = w.angle - half + 2 * half * u;
      // Ripple in and out, pinched to nothing at the tips.
      const wobble =
        Math.sin(u * 9 + w.age * RIPPLE_SPEED + k * 1.7) *
        RIPPLE *
        Math.sin(u * Math.PI);
      const px = w.x + Math.cos(a) * (r + wobble);
      const py = w.y + Math.sin(a) * (r + wobble);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
  }
}

const contexts = new WeakMap<CombatContext, Waves>();

/**
 * Pressure wave: a cone of rippling arcs rolling out from the player on world time. Every zombie
 * the front sweeps over takes a little damage and a huge shove straight away from the gun.
 */
export const sonic: ShotHandler = {
  ownMuzzle: true,
  fromBody: true,
  fire(ctx, def, ox, oy, dirX, dirY) {
    let waves = contexts.get(ctx);
    if (!waves) {
      waves = new Waves();
      contexts.set(ctx, waves);
      ctx.fx.view.addChild(waves.view);
    }
    const w: Wave = waves.pool.pop() ?? {
      view: new Graphics({ label: "sonicWave" }),
      x: 0,
      y: 0,
      angle: 0,
      r: 0,
      age: 0,
      dustLeft: 0,
      hit: new Set(),
      def,
      damageScale: 1,
      dismemberScale: 1,
    };
    w.x = ox;
    w.y = oy;
    w.angle = Math.atan2(dirY, dirX);
    w.r = START_RADIUS;
    w.age = 0;
    w.dustLeft = 0;
    w.def = def;
    w.damageScale = ctx.damageScale;
    w.dismemberScale = ctx.dismemberScale;
    w.view.clear();
    waves.view.addChild(w.view);
    waves.live.push(w);
    ctx.fx.dust(
      ox + dirX * START_RADIUS,
      oy + dirY * START_RADIUS,
      dirX,
      dirY,
      4,
    );
  },
  update(ctx, dt) {
    contexts.get(ctx)?.update(ctx, dt);
  },
};

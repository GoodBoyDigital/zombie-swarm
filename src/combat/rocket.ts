import { Assets, Container, Graphics, GraphicsContext, Sprite } from "pixi.js";
import { ARENA } from "../config/arena";
import { EXPLOSIONS } from "../config/explosions";
import { rand } from "../core/random";
import type { CombatContext } from "./CombatContext";
import { explode } from "./explosion";
import { raycastZombies } from "./raycast";
import type { ShotHandler } from "./shots";

const SPEED = 700;
/** The rocket and its flame are drawn this many times their sprite size; the hit radius follows. */
const ROCKET_SCALE = 2;
const RADIUS = 4 * ROCKET_SCALE;
/** Where the exhaust leaves the rocket, px behind its centre. */
const NOZZLE = 12 * ROCKET_SCALE;
/**
 * Exhaust: a dense rolling smoke trail that billows out and drifts as it cools, with hot embers
 * right behind the nozzle. A puff every SMOKE_STEP px of flight, so it's continuous at any speed.
 */
const SMOKE_STEP = 6;
const SMOKE_SECONDS = 1.1;
/** Radius of a fresh puff, px, and how much bigger it billows by the end of its life. */
const SMOKE_SIZE = 7;
const SMOKE_GROW = 3.2;
/** Sideways scatter and backward push of fresh puffs, px/s, bled off as they hang in the air. */
const SMOKE_DRIFT = 28;
const SMOKE_PUSH = 50;
const SMOKE_DRAG = 2.5;
const SMOKE_GREYS = [0x9e9b93, 0x8b8880, 0xb1aea6, 0x7c7a73];
const EMBER_SECONDS = 0.2;
const EMBER_SIZE = 5;
const EMBER_COLORS = [0xffb347, 0xff7a1a, 0xffe08a];
/** Launch: a burst of smoke and embers thrown back out of the tube. */
const BACKBLAST_SMOKE = 16;
const BACKBLAST_EMBERS = 8;
const BACKBLAST_SPEED = 170;

/** A soft lumpy puff, unit radius, white so each puff tints it. */
const PUFF = new GraphicsContext()
  .circle(0, 0, 1)
  .fill({ color: 0xffffff, alpha: 0.5 })
  .circle(-0.18, -0.15, 0.72)
  .fill(0xffffff)
  .circle(0.3, 0.2, 0.5)
  .fill({ color: 0xffffff, alpha: 0.8 });

interface Projectile {
  view: Container;
  flame: Graphics;
  dx: number;
  dy: number;
  left: number;
  smokeLeft: number;
  damageScale: number;
}

interface Puff {
  view: Graphics;
  ember: boolean;
  life: number;
  maxLife: number;
  size: number;
  vx: number;
  vy: number;
}

/** Each weapon context owns its projectiles, so restarts cannot reuse an old world's bodies. */
class Rockets {
  readonly view = new Container({ label: "rocketProjectiles" });
  readonly live: Projectile[] = [];
  readonly pool: Projectile[] = [];
  readonly smoke: Puff[] = [];
  readonly smokePool: Puff[] = [];

  create(): Projectile {
    const view = new Container({ label: "rocketProjectile" });
    const flame = new Graphics({ label: "rocketExhaust" })
      .poly([-10, -3, -29, 0, -10, 3])
      .fill(0xff7a1a)
      .poly([-10, -1.7, -22, 0, -10, 1.7])
      .fill(0xffed9a);
    view.addChild(
      flame,
      new Sprite({
        texture: Assets.get("/sprites/projectile-rocket.png"),
        anchor: 0.5,
      }),
    );
    view.scale.set(ROCKET_SCALE);
    return { view, flame, dx: 0, dy: 0, left: 0, smokeLeft: 0, damageScale: 1 };
  }

  /** One exhaust puff at (x, y) moving at (vx, vy): grey smoke, or a hot additive ember. */
  puff(x: number, y: number, vx: number, vy: number, ember: boolean): void {
    const p = this.smokePool.pop() ?? {
      view: new Graphics({ context: PUFF, label: "rocketSmoke" }),
      ember: false,
      life: 0,
      maxLife: 0,
      size: 0,
      vx: 0,
      vy: 0,
    };
    p.ember = ember;
    p.maxLife = p.life = ember
      ? EMBER_SECONDS * rand(0.7, 1.3)
      : SMOKE_SECONDS * rand(0.8, 1.2);
    p.size = (ember ? EMBER_SIZE : SMOKE_SIZE) * rand(0.75, 1.25);
    p.vx = vx;
    p.vy = vy;
    p.view.tint = ember
      ? EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)]
      : SMOKE_GREYS[Math.floor(Math.random() * SMOKE_GREYS.length)];
    p.view.blendMode = ember ? "add" : "normal";
    p.view.rotation = rand(0, Math.PI * 2);
    p.view.position.set(x, y);
    p.view.scale.set(p.size);
    // Smoke under everything already in the trail; embers on top of it.
    if (ember) this.view.addChild(p.view);
    else this.view.addChildAt(p.view, 0);
    this.smoke.push(p);
  }

  /** A puff thrown out from (x, y) along `angle` at `speed`, with the usual scatter. */
  burst(
    x: number,
    y: number,
    angle: number,
    speed: number,
    ember: boolean,
  ): void {
    this.puff(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, ember);
  }

  update(ctx: CombatContext, dt: number): void {
    const drag = Math.exp(-dt * SMOKE_DRAG);
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.view.removeFromParent();
        this.smoke[i] = this.smoke[this.smoke.length - 1];
        this.smoke.pop();
        this.smokePool.push(p);
        continue;
      }
      const age = 1 - p.life / p.maxLife;
      p.view.x += p.vx * dt;
      p.view.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      if (p.ember) {
        p.view.alpha = 1 - age;
        p.view.scale.set(p.size * (1 - age * 0.6));
      } else {
        // Billow out fast, then hang and thin away.
        p.view.alpha = 0.8 * (1 - age) ** 1.4;
        p.view.scale.set(p.size * (1 + SMOKE_GROW * Math.sqrt(age)));
      }
    }

    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      const { x, y } = p.view;
      // Clip the swept segment to range and the first arena edge before querying zombies.
      const wallX =
        p.dx > 0
          ? (ARENA.width - RADIUS - x) / p.dx
          : p.dx < 0
            ? (RADIUS - x) / p.dx
            : Infinity;
      const wallY =
        p.dy > 0
          ? (ARENA.height - RADIUS - y) / p.dy
          : p.dy < 0
            ? (RADIUS - y) / p.dy
            : Infinity;
      const limit = Math.max(0, Math.min(p.left, wallX, wallY));
      const step = Math.min(SPEED * dt, limit);
      const hit = raycastZombies(
        ctx.horde.hash,
        x,
        y,
        p.dx,
        p.dy,
        step,
        1,
        RADIUS,
      )[0];
      const travel = hit ? hit.t : step;
      // Distance-based emission stays continuous even on a long frame.
      let d = p.smokeLeft;
      for (; d <= travel; d += SMOKE_STEP) {
        const ex = x + p.dx * (d - NOZZLE);
        const ey = y + p.dy * (d - NOZZLE);
        const side = rand(-SMOKE_DRIFT, SMOKE_DRIFT);
        this.puff(
          ex,
          ey,
          -p.dx * SMOKE_PUSH - p.dy * side,
          -p.dy * SMOKE_PUSH + p.dx * side,
          false,
        );
        this.puff(ex, ey, -p.dx * SMOKE_PUSH * 2, -p.dy * SMOKE_PUSH * 2, true);
      }
      p.smokeLeft = d - travel;
      p.view.position.set(x + p.dx * travel, y + p.dy * travel);
      p.left -= travel;
      p.flame.scale.set(0.8 + Math.random() * 0.4, 0.75 + Math.random() * 0.5);

      if (!hit && step < limit) continue;
      const scale = ctx.damageScale;
      ctx.damageScale = p.damageScale;
      explode(ctx, p.view.x, p.view.y, EXPLOSIONS.rocket);
      ctx.damageScale = scale;
      p.view.removeFromParent();
      this.live.splice(i, 1);
      this.pool.push(p);
    }
  }
}

const contexts = new WeakMap<CombatContext, Rockets>();

export const rocket: ShotHandler = {
  fire(ctx, def, ox, oy, dirX, dirY) {
    let shots = contexts.get(ctx);
    if (!shots) {
      shots = new Rockets();
      contexts.set(ctx, shots);
      ctx.fx.view.addChild(shots.view);
    }
    const p = shots.pool.pop() ?? shots.create();
    p.dx = dirX;
    p.dy = dirY;
    p.left = def.range;
    p.smokeLeft = 0;
    p.damageScale = ctx.damageScale;
    p.view.position.set(
      Math.min(ARENA.width - RADIUS, Math.max(RADIUS, ox)),
      Math.min(ARENA.height - RADIUS, Math.max(RADIUS, oy)),
    );
    p.view.rotation = Math.atan2(dirY, dirX);
    shots.view.addChild(p.view);
    shots.live.push(p);
    // Backblast: smoke and embers thrown back out of the tube, fanning wide.
    const back = Math.atan2(-dirY, -dirX);
    for (let i = 0; i < BACKBLAST_SMOKE; i++)
      shots.burst(
        p.view.x,
        p.view.y,
        back + rand(-0.9, 0.9),
        BACKBLAST_SPEED * rand(0.3, 1),
        false,
      );
    for (let i = 0; i < BACKBLAST_EMBERS; i++)
      shots.burst(
        p.view.x,
        p.view.y,
        back + rand(-0.5, 0.5),
        BACKBLAST_SPEED * rand(0.8, 1.6),
        true,
      );
  },
  update(ctx, dt) {
    contexts.get(ctx)?.update(ctx, dt);
  },
};

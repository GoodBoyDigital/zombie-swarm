import { Assets, Container, Graphics, Sprite } from "pixi.js";
import { ARENA } from "../config/arena";
import { EXPLOSIONS } from "../config/explosions";
import type { CombatContext } from "./CombatContext";
import { explode } from "./explosion";
import { raycastZombies } from "./raycast";
import type { ShotHandler } from "./shots";

const SPEED = 700;
const RADIUS = 4;
const SMOKE_STEP = 18;
const SMOKE_SECONDS = 0.32;

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
  life: number;
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
    return { view, flame, dx: 0, dy: 0, left: 0, smokeLeft: 0, damageScale: 1 };
  }

  puff(x: number, y: number): void {
    const p = this.smokePool.pop() ?? {
      view: new Graphics({ label: "rocketSmoke" })
        .circle(0, 0, 4)
        .fill(0xa6a59c),
      life: 0,
    };
    p.life = SMOKE_SECONDS;
    p.view.position.set(x, y);
    p.view.scale.set(0.65);
    p.view.alpha = 0.5;
    this.view.addChildAt(p.view, 0);
    this.smoke.push(p);
  }

  update(ctx: CombatContext, dt: number): void {
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.view.removeFromParent();
        this.smoke.splice(i, 1);
        this.smokePool.push(p);
        continue;
      }
      const age = 1 - p.life / SMOKE_SECONDS;
      p.view.alpha = (1 - age) * 0.5;
      p.view.scale.set(0.65 + age * 1.5);
      p.view.y -= dt * 9;
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
      for (; d <= travel; d += SMOKE_STEP)
        this.puff(x + p.dx * d - p.dx * 12, y + p.dy * d - p.dy * 12);
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
  },
  update(ctx, dt) {
    contexts.get(ctx)?.update(ctx, dt);
  },
};

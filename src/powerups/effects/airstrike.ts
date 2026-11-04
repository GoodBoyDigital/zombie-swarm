import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { explode } from "../../combat/explosion";
import { raycastZombies } from "../../combat/raycast";
import { ARENA } from "../../config/arena";
import { EXPLOSIONS, type ExplosionDef } from "../../config/explosions";
import type { EffectDef } from "../../config/powerups";
import { rand } from "../../core/random";
import type { PowerupContext, PowerupEffect } from "../PowerupContext";

type Def = EffectDef<"airstrike">;

const RED = 0xff4436;
const INK = 0x151a15;
/** The plane is drawn this far above its ground track; bombs fall the difference. */
const ALTITUDE = 34;
/** Floor shadow offset from the ground track, light from the top left. */
const SHADOW_X = 26;
const SHADOW_Y = 22;
const SHADOW_ALPHA = 0.28;
/** Motion stretch along the flight line, and the faint trailing copies behind the plane. */
const STRETCH = 1.12;
const PLANE_SCALE = 1.95;
const GHOSTS = [
  { gap: 22, alpha: 0.12 },
  { gap: 44, alpha: 0.05 },
];
/** Smallest share of bombSpread a bomb lands off the line, so the alternation always shows. */
const MIN_SPREAD = 0.35;
/** Bombs keep this fraction of the plane's speed as they fall. */
const BOMB_CARRY = 0.3;
/** Strafing: rounds hit the floor this far ahead of the plane, a short raycast long, this often. */
const STRAFE_LEAD = 190;
const STRAFE_RAY = 60;
const STRAFE_ROUND_GAP = 0.035;
const STRAFE_KNOCKBACK = 180;
/** The warning band's chevrons march this many per second. */
const CHEVRON_GAP = 70;
const CHEVRON_RATE = 9;
/** The roar peaks about this long after it starts, so it starts that long before the plane is mid-view. */
const ROAR_PEAK = 0.35;

interface Bomb {
  /** Impact point, and the time it's released and lands, in seconds since pickup. */
  x: number;
  y: number;
  release: number;
  land: number;
  view: Graphics | null;
  done: boolean;
}

interface Round {
  at: number;
  /** Ground hit offset across the line. */
  dy: number;
  done: boolean;
}

interface Strike {
  /** Seconds since pickup on the world clock, so the strike plays out in slow motion with the world. */
  t: number;
  /** World seconds until the last blast has faded. */
  end: number;
  /** Ground track and the plane's run across it, world px. */
  y: number;
  x0: number;
  /** Seconds since pickup the plane enters, is mid-view and leaves. */
  enter: number;
  mid: number;
  exit: number;
  roared: boolean;
  bombs: Bomb[];
  rounds: Round[];
  /** Explosion for every bomb but the last, with its share of the shake budget, and the final one. */
  blast: ExplosionDef;
  finale: ExplosionDef;
  root: Container;
  /** Plane and falling bombs, in the sky layer over the blasts. */
  sky: Container;
  warning: Container;
  chevrons: Graphics[];
  plane: Container;
  shadow: Sprite;
}

/**
 * A plane flies left to right across the view along the pickup's horizontal line, strafes the
 * ground ahead and drops a stick of bombs that blow up one after another behind it.
 */
export const airstrike: PowerupEffect<Def, Strike> = {
  start(ctx, def, active) {
    const tex = Assets.get<Texture>(def.sprite);
    const view = visibleView(ctx);
    const y = Math.min(ARENA.height, Math.max(0, active.origin.y));
    const length = tex.width * STRETCH * PLANE_SCALE;
    const x0 = view.left - length;
    const x1 = view.right + length;
    const enter = def.warningSeconds;
    const planeAt = (x: number) => enter + (x - x0) / def.planeSpeed;

    // Bombs centred on the view, alternating either side of the line with a random scatter, and
    // skipping any that would land past the arena wall.
    const carry = def.planeSpeed * BOMB_CARRY * def.bombDelay;
    const centre = (view.left + view.right) / 2;
    const bombs: Bomb[] = [];
    for (let i = 0; i < def.bombs; i++) {
      const x =
        centre +
        (i - (def.bombs - 1) / 2) * def.bombSpacing +
        rand(-def.bombJitter, def.bombJitter);
      const side = i % 2 === 0 ? -1 : 1;
      const by = Math.min(
        ARENA.height,
        Math.max(0, y + side * def.bombSpread * rand(MIN_SPREAD, 1)),
      );
      if (x < 0 || x > ARENA.width) continue;
      const release = planeAt(x - carry);
      bombs.push({
        x,
        y: by,
        release,
        land: release + def.bombDelay,
        view: null,
        done: false,
      });
    }

    // Bursts spread over the view before the last bomb drops, each a quick string of rounds.
    const rounds: Round[] = [];
    for (let b = 0; b < def.strafeBursts; b++) {
      const at = planeAt(
        view.left + ((b + 0.5) / def.strafeBursts) * (view.right - view.left),
      );
      for (let r = 0; r < def.strafeRounds; r++)
        rounds.push({
          at: at + r * STRAFE_ROUND_GAP,
          dy: rand(-18, 18),
          done: false,
        });
    }

    const base = EXPLOSIONS[def.explosion];
    const s = def.lastBombScale;
    const root = new Container({ label: "airstrike" });
    const warning = new Container();
    const chevrons = drawWarning(
      warning,
      Math.max(0, view.left),
      Math.min(ARENA.width, view.right),
      y,
      base.radius,
    );
    const shadow = new Sprite({ texture: tex, anchor: 0.5, tint: 0x000000 });
    shadow.alpha = SHADOW_ALPHA;
    shadow.scale.set(STRETCH * 0.92 * PLANE_SCALE, 0.92 * PLANE_SCALE);
    const plane = new Container({ label: "airstrikePlane" });
    for (const g of [...GHOSTS].reverse()) {
      const ghost = new Sprite({ texture: tex, anchor: 0.5 });
      ghost.x = -g.gap;
      ghost.alpha = g.alpha;
      plane.addChild(ghost);
    }
    plane.addChild(new Sprite({ texture: tex, anchor: 0.5 }));
    plane.scale.set(STRETCH * PLANE_SCALE, PLANE_SCALE / STRETCH ** 0.5);
    plane.visible = shadow.visible = false;
    root.addChild(warning, shadow);
    ctx.world.addChild(root);
    const sky = new Container({ label: "airstrikeSky" });
    sky.addChild(plane);
    ctx.sky.addChild(sky);

    active.state = {
      t: 0,
      end: 0,
      y,
      x0,
      enter,
      mid: planeAt((view.left + view.right) / 2),
      exit: planeAt(x1),
      roared: false,
      bombs,
      rounds,
      blast: {
        ...base,
        shake: Math.min(
          base.shake,
          def.shakeBudget / Math.max(1, bombs.length - 1),
        ),
      },
      finale: {
        ...base,
        radius: base.radius * s,
        damage: base.damage * s,
        shake: base.shake * s,
        debris: Math.round(base.debris * s),
        volume: base.volume * s,
        pitch: base.pitch / s ** 0.5,
      },
      root,
      sky,
      warning,
      chevrons,
      plane,
      shadow,
    };
    const lastLand = bombs[bombs.length - 1]?.land ?? 0;
    active.state.end = Math.max(active.state.exit, lastLand + base.seconds);
    active.left = active.state.end;
  },

  update(ctx, def, dt, active) {
    const st = active.state;
    const t = (st.t += dt * ctx.timeScale);
    active.left = st.end - t;

    // Warning: the band flashes and its chevrons march along the strike path, then fade as the plane arrives.
    const warn = t / def.warningSeconds;
    st.warning.visible = warn < 1.6;
    st.warning.alpha =
      (warn < 1 ? 0.55 + 0.45 * Math.round((t * 8) % 1) : 1.6 - warn) * 0.9;
    st.chevrons.forEach((c, i) => {
      c.alpha = 0.35 + 0.65 * Math.max(0, Math.cos(t * CHEVRON_RATE - i * 0.9));
    });

    const px = st.x0 + (t - st.enter) * def.planeSpeed;
    const flying = t >= st.enter;
    st.plane.visible = st.shadow.visible = flying;
    st.plane.position.set(px, st.y - ALTITUDE);
    st.shadow.position.set(px + SHADOW_X, st.y + SHADOW_Y);

    if (!st.roared && t >= st.mid - ROAR_PEAK) {
      st.roared = true;
      ctx.audio.play("airstrikeRoar", {
        volume: 0.9,
        pan: { from: -0.6, to: 1, seconds: (st.exit - t) / ctx.timeScale },
      });
    }

    for (const r of st.rounds) {
      if (r.done || t < r.at) continue;
      r.done = true;
      strafe(ctx, def, px, st.y + r.dy);
    }

    st.bombs.forEach((b, i) => {
      if (b.done || t < b.release) return;
      const fall = Math.min(
        1,
        (t - b.release) / Math.max(0.001, def.bombDelay),
      );
      b.view ??= st.sky.addChild(drawBomb());
      const carry = def.planeSpeed * BOMB_CARRY * def.bombDelay;
      // From the wing on that side down to the impact point.
      const wing = st.y + (b.y - st.y) * 0.5 - ALTITUDE;
      b.view.position.set(
        b.x - carry * (1 - fall),
        wing + (b.y - wing) * fall * fall,
      );
      b.view.scale.set(1 - 0.45 * fall);
      if (fall < 1) return;
      b.done = true;
      b.view.destroy();
      b.view = null;
      explode(ctx, b.x, b.y, i === st.bombs.length - 1 ? st.finale : st.blast);
    });
  },

  end(_ctx, _def, active) {
    active.state.root.destroy({ children: true });
    active.state.sky.destroy({ children: true });
  },
};

/** The world rect on screen right now, from the camera. */
function visibleView(ctx: PowerupContext) {
  const tl = ctx.camera.screenToWorld(0, 0);
  const br = ctx.camera.screenToWorld(
    ctx.screenRect.width,
    ctx.screenRect.height,
  );
  return { left: tl.x, top: tl.y, right: br.x, bottom: br.y };
}

/** One round from the plane's guns: a tracer down to the floor ahead, hitting what's on a short stretch there. */
function strafe(ctx: PowerupContext, def: Def, px: number, gy: number): void {
  const gx = px + STRAFE_LEAD + rand(-30, 30);
  if (gx < 0 || gx > ARENA.width) return;
  ctx.fx.tracer(px, gy - ALTITUDE, gx, gy, 3);
  ctx.fx.sparkle(gx, gy, 0xffd23a, 3);
  ctx.beginVolley();
  for (const hit of raycastZombies(
    ctx.horde.hash,
    gx - STRAFE_RAY / 2,
    gy,
    1,
    0,
    STRAFE_RAY,
    2,
  ))
    ctx.applyHit(
      hit.zombie,
      hit.x,
      hit.y,
      1,
      0,
      def.strafeDamage,
      STRAFE_KNOCKBACK,
    );
}

/** Red band across the strike path with chevrons pointing the way the plane will fly. */
function drawWarning(
  into: Container,
  left: number,
  right: number,
  y: number,
  halfHeight: number,
): Graphics[] {
  const h = halfHeight * 0.7;
  into.addChild(
    new Graphics()
      .rect(left, y - h, right - left, h * 2)
      .fill({ color: RED, alpha: 0.14 })
      .moveTo(left, y - h)
      .lineTo(right, y - h)
      .moveTo(left, y + h)
      .lineTo(right, y + h)
      .stroke({ width: 3, color: RED, alpha: 0.85 }),
  );
  const chevrons: Graphics[] = [];
  for (let x = left + CHEVRON_GAP / 2; x < right; x += CHEVRON_GAP) {
    const c = new Graphics()
      .poly([-12, -22, 6, 0, -12, 22, -2, 22, 16, 0, -2, -22])
      .fill(RED)
      .stroke({ width: 2.5, color: INK, join: "round" });
    c.position.set(x, y);
    into.addChild(c);
    chevrons.push(c);
  }
  return chevrons;
}

/** A small finned bomb, nose right. */
function drawBomb(): Graphics {
  return new Graphics()
    .poly([-13, -6, -7, 0, -13, 6, -9, 0])
    .fill(0x3a3f3a)
    .stroke({ width: 1.5, color: INK, join: "round" })
    .ellipse(0, 0, 9, 4.5)
    .fill(0x4a5048)
    .stroke({ width: 1.5, color: INK })
    .ellipse(2, -1.5, 4, 1.2)
    .fill({ color: 0xffffff, alpha: 0.3 });
}

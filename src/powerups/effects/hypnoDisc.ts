import { Container, Graphics, GraphicsContext, type Texture } from "pixi.js";
import { raycastZombies } from "../../combat/raycast";
import { ARENA } from "../../config/arena";
import type { EffectDef } from "../../config/powerups";
import { rand } from "../../core/random";
import type { Zombie } from "../../entities/Zombie";
import { wallHit } from "../../world/walls";
import type { PowerupContext, PowerupEffect } from "../PowerupContext";

type Def = EffectDef<"hypnoDisc">;

const INK = 0x151a15;
const STEEL = 0x9aa3a8;
const STEEL_LIGHT = 0xe4eaec;
const STEEL_FACE = 0xb9c1c5;
const STEEL_DARK = 0x737b80;
const RED = 0xd63a35;
const CREAM = 0xf6eccb;
const TAU = Math.PI * 2;
/** Blade spin in flight, radians per second. */
const BLADE_SPIN = 28;
/** A spent blade settles onto the floor at this share of its flying size, tinted darker so it reads as lying flat. */
const SPENT_SCALE = 0.8;
const SPENT_TINT = 0x8c8c8c;
/** Radius the spent-blade texture is baked at, px; stamps scale it down to the blade. */
const SPENT_BAKE_RADIUS = 32;
/** Apparent growth per px of height while a spent blade drops, as for casings. */
const HEIGHT_SCALE = 0.02;
/** Share of settleSeconds the drop to the floor takes. */
const DROP_SHARE = 0.35;
/** The skid decays by e^-SKID_DECAY over settleSeconds, so it has all but stopped by then. */
const SKID_DECAY = 5;
/** A blade that reaches a wall sticks in it this long, then drops off it onto the floor. */
const STUCK_SECONDS = 0.6;
/** How far a blade dropping off a wall lands from where it was stuck, as a share of its radius. */
const WALL_DROP = 0.8;
/** The disc pops in and shrinks away over these, in world seconds. */
const POP_IN = 0.12;
const POP_OUT = 0.15;
/** Seconds between "shing" launch sounds, and between slice sounds while blades are landing hits. */
const SHING_GAP = 0.07;
const SLICE_GAP = 0.06;

/**
 * Shared vector art, built once and drawn at unit radius: every disc and blade uses the same
 * geometry, scaled. Faint speed streak trailing each blade along its flight line, so the spiral
 * arms read as lines.
 */
const STREAK = new GraphicsContext()
  .poly([0, -0.7, -2.6, 0, 0, 0.7])
  .fill({ color: STEEL_LIGHT, alpha: 0.3 });

/** Hooked steel saw teeth round the rim, with a glint, shared by the disc and its blades. */
function sawTeeth(): GraphicsContext {
  const TEETH = 16;
  const teeth: number[] = [];
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * TAU;
    const step = TAU / TEETH;
    teeth.push(Math.cos(a) * 1, Math.sin(a) * 1);
    teeth.push(
      Math.cos(a + step * 0.75) * 0.8,
      Math.sin(a + step * 0.75) * 0.8,
    );
  }
  return new GraphicsContext()
    .poly(teeth)
    .fill(STEEL)
    .stroke({ width: 0.09, color: INK, join: "round" })
    .arc(0, 0, 0.82, Math.PI * 1.05, Math.PI * 1.55)
    .stroke({ width: 0.06, color: STEEL_LIGHT, cap: "round" });
}

/** The disc over the deploy point, like the icon: saw teeth round a red and cream spiral, a dark hub. */
const DISC = (() => {
  const g = sawTeeth().circle(0, 0, 0.72).fill(CREAM);
  spiralArms(g, 0.72, 3, RED, 1);
  return g
    .circle(0, 0, 0.72)
    .stroke({ width: 0.07, color: INK })
    .circle(0, 0, 0.17)
    .fill(0x4a5048)
    .stroke({ width: 0.06, color: INK })
    .circle(0, 0, 0.08)
    .fill(0x2c302c);
})();

/**
 * A thrown blade: a plain old-school circular saw, all steel. Brighter face plate with a glint,
 * expansion slots cut in from the rim, a darker clamping collar and the arbor hole.
 */
const BLADE = (() => {
  const SLOTS = 4;
  const g = sawTeeth()
    .circle(0, 0, 0.74)
    .fill(STEEL_FACE)
    .stroke({ width: 0.05, color: INK })
    .arc(0, 0, 0.6, Math.PI * 1.1, Math.PI * 1.45)
    .stroke({ width: 0.07, color: STEEL_LIGHT, cap: "round" })
    .arc(0, 0, 0.6, Math.PI * 0.15, Math.PI * 0.3)
    .stroke({ width: 0.05, color: STEEL_LIGHT, cap: "round" });
  for (let i = 0; i < SLOTS; i++) {
    const a = (i / SLOTS) * TAU + 0.4;
    g.moveTo(Math.cos(a) * 0.82, Math.sin(a) * 0.82)
      .lineTo(Math.cos(a + 0.12) * 0.56, Math.sin(a + 0.12) * 0.56)
      .stroke({ width: 0.06, color: INK, cap: "round" })
      .circle(Math.cos(a + 0.12) * 0.54, Math.sin(a + 0.12) * 0.54, 0.05)
      .fill(INK);
  }
  return g
    .circle(0, 0, 0.3)
    .fill(STEEL_DARK)
    .stroke({ width: 0.05, color: INK })
    .circle(0, 0, 0.11)
    .fill(0x2c302c)
    .stroke({ width: 0.04, color: INK });
})();

/** `arms` spiral bands from the centre out to `radius`, each half the gap between arms wide. */
function spiralArms(
  g: GraphicsContext,
  radius: number,
  arms: number,
  color: number,
  alpha: number,
): GraphicsContext {
  const STEPS = 24;
  const TWIST = TAU * 1.1;
  const width = Math.PI / arms;
  for (let k = 0; k < arms; k++) {
    const a0 = (k / arms) * TAU;
    const edge: number[] = [];
    const back: number[] = [];
    for (let s = 0; s <= STEPS; s++) {
      const f = s / STEPS;
      const r = f * radius;
      const a = a0 + f * TWIST;
      edge.push(Math.cos(a) * r, Math.sin(a) * r);
      back.unshift(Math.cos(a + width) * r, Math.sin(a + width) * r);
    }
    g.poly([...edge, ...back]).fill({ color, alpha });
  }
  return g;
}

interface Blade {
  view: Container;
  /** A plain steel saw blade, spinning in flight; the streak behind it holds the flight direction. */
  saw: Graphics;
  /** World px; also how far its sweep reaches past a zombie's circle. */
  radius: number;
  streak: Graphics;
  dx: number;
  dy: number;
  pierce: number;
  /** Zombies this blade already cut, so it hits each once. */
  hit: Zombie[];
  /** Seconds left stuck in a wall, or 0 while flying. */
  stuck: number;
  /** World seconds since it was spent, skidding and settling onto the floor; -1 before that. */
  skid: number;
  /** Where it was spent, how far it skids from there (along dx, dy), its angle and spin rate then. */
  x0: number;
  y0: number;
  skidLength: number;
  spin0: number;
  spin: number;
}

interface Spin {
  /** World seconds since pickup: the disc spins, emits and its blades fly on the world clock. */
  t: number;
  /** Emitter angle at pickup, so successive discs don't spiral the same way round. */
  phase: number;
  /** Where the player stood at pickup: the disc and emitter stay put here while he moves on. */
  x: number;
  y: number;
  /** Volleys of `arms` blades launched so far. */
  emitted: number;
  blades: Blade[];
  lastShing: number;
  lastSlice: number;
  /** A blade landed a hit since the last slice sound. */
  sliced: boolean;
  disc: Graphics;
  root: Container;
}

/** Spent blades, kept for the next disc. */
const pool: Blade[] = [];
/** The disc baked once for stamping spent blades into the floor. */
let spentTexture: Texture | null = null;

/**
 * A saw disc deploys where the player stands and spins there for `seconds`, flinging razor blades out along spiral arms.
 * Each blade flies straight and stops in the first `bladePierce` zombies it hits (each once,
 * through applyHit with a raised tear-off chance), then drops and skids to rest on the floor,
 * where it is stamped. One that misses flies on until it bites into a wall, then drops off it
 * onto the floor the same way; none just vanish.
 */
export const hypnoDisc: PowerupEffect<Def, Spin> = {
  start(ctx, def, active) {
    const root = new Container({ label: "hypnoDisc" });
    const disc = new Graphics({ context: DISC, label: "hypnoDiscSaw" });
    ctx.world.addChild(root, disc);
    // One volley for the whole spin: its kills share one set of drop caps, like a blast's.
    ctx.beginVolley();
    active.state = {
      t: 0,
      phase: rand(0, TAU),
      x: ctx.player.x,
      y: ctx.player.y,
      emitted: 0,
      blades: [],
      lastShing: -1,
      lastSlice: -1,
      sliced: false,
      disc,
      root,
    };
    active.left = 1;
    hypnoDisc.update?.(ctx, def, 0, active);
  },

  update(ctx, def, dt, active) {
    const st = active.state;
    const wdt = dt * ctx.timeScale;
    const t = (st.t += wdt);
    const spinning = t < def.seconds;
    const turn = st.phase + def.spinRate * TAU * t;

    ctx.dismemberScale = def.dismemberScale;
    // Launch every volley due by now, each from the angle the emitter had at its own moment and
    // already as far out as it would be, so the spiral stays smooth on a long frame.
    const arms = Math.max(1, Math.round(def.arms));
    const rate = def.bladesPerSecond / arms;
    const due =
      Math.floor(Math.min(t, def.seconds) * rate) + (spinning ? 1 : 0);
    for (; st.emitted < due; st.emitted++) {
      const at = st.emitted / rate;
      const base = st.phase + def.spinRate * TAU * at;
      for (let k = 0; k < arms; k++)
        launch(
          ctx,
          def,
          st,
          base + (k / arms) * TAU,
          (t - at) * def.bladeSpeed,
        );
      if (at - st.lastShing >= SHING_GAP) {
        st.lastShing = at;
        ctx.audio.play("hypnoShing", { pitch: rand(0.9, 1.25), volume: 0.35 });
      }
    }

    for (let i = st.blades.length - 1; i >= 0; i--) {
      const b = st.blades[i];
      const alive =
        b.skid >= 0
          ? skid(ctx, def, b, wdt)
          : b.stuck > 0
            ? stick(b, wdt)
            : fly(ctx, def, st, b, wdt);
      if (alive) continue;
      b.view.removeFromParent();
      st.blades.splice(i, 1);
      pool.push(b);
    }
    ctx.dismemberScale = 1;

    // Throttled slices; the zombie hit, death and tear sounds may play again with them.
    if (st.sliced && t - st.lastSlice >= SLICE_GAP) {
      st.lastSlice = t;
      st.sliced = false;
      ctx.audio.play("hypnoSlice", { pitch: rand(0.85, 1.2), volume: 0.7 });
      ctx.hitSoundPlayed = ctx.deathSoundPlayed = ctx.tearSoundPlayed = false;
    }

    // Disc pops in at the deploy point, spins with the emitter so blades leave its teeth, then shrinks away.
    const pop =
      t < POP_IN
        ? easeOutBack(t / POP_IN)
        : Math.min(1, Math.max(0, 1 - (t - def.seconds) / POP_OUT));
    st.disc.visible = pop > 0;
    st.disc.position.set(st.x, st.y);
    st.disc.rotation = turn;
    st.disc.scale.set(def.discRadius * pop);

    const done = !spinning && pop <= 0 && st.blades.length === 0;
    active.left = done ? 0 : 1;
  },

  end(ctx, _def, active) {
    const st = active.state;
    for (const b of st.blades) {
      if (b.skid >= 0) stampSpent(ctx, b);
      b.view.removeFromParent();
      pool.push(b);
    }
    st.blades.length = 0;
    ctx.dismemberScale = 1;
    st.root.destroy();
    st.disc.destroy();
  },
};

/** One blade off the disc rim along `angle`, `out` px further along for the time since its launch. */
function launch(
  ctx: PowerupContext,
  def: Def,
  st: Spin,
  angle: number,
  out: number,
): void {
  const b = pool.pop() ?? newBlade();
  b.dx = Math.cos(angle);
  b.dy = Math.sin(angle);
  b.pierce = def.bladePierce;
  b.hit.length = 0;
  b.stuck = 0;
  b.skid = -1;
  b.saw.tint = 0xffffff;
  b.streak.visible = true;
  b.streak.rotation = angle;
  b.radius = def.discRadius * def.bladeScale;
  b.saw.scale.set(b.radius);
  b.streak.scale.set(b.radius);
  b.saw.rotation = rand(0, TAU);
  const r = def.discRadius * 0.8;
  b.view.position.set(st.x + b.dx * r, st.y + b.dy * r);
  st.root.addChild(b.view);
  st.blades.push(b);
  // Catch up to where it would be by now, hitting what it passed on the way.
  if (out > 0) fly(ctx, def, st, b, out / def.bladeSpeed);
}

function newBlade(): Blade {
  const view = new Container({ label: "hypnoBlade" });
  const streak = view.addChild(new Graphics({ context: STREAK }));
  const saw = view.addChild(new Graphics({ context: BLADE }));
  return {
    view,
    saw,
    streak,
    radius: 0,
    dx: 0,
    dy: 0,
    pierce: 0,
    hit: [],
    stuck: 0,
    skid: -1,
    x0: 0,
    y0: 0,
    skidLength: 0,
    spin0: 0,
    spin: 0,
  };
}

/** Move a blade one step, cutting what it sweeps through. False once it has flown off out of a gate. */
function fly(
  ctx: PowerupContext,
  def: Def,
  st: Spin,
  b: Blade,
  dt: number,
): boolean {
  const { x, y } = b.view;
  const wall = wallHit(x, y, b.dx, b.dy);
  const step = def.bladeSpeed * dt;
  const reach = wall
    ? Math.min(step, Math.max(0, wall.t - b.radius * 0.5))
    : step;
  let travel = reach;
  for (const hit of raycastZombies(
    ctx.horde.hash,
    x,
    y,
    b.dx,
    b.dy,
    reach,
    Infinity,
    b.radius,
  )) {
    if (b.hit.includes(hit.zombie)) continue;
    b.hit.push(hit.zombie);
    ctx.applyHit(
      hit.zombie,
      hit.x,
      hit.y,
      b.dx,
      b.dy,
      def.bladeDamage,
      def.bladeKnockback,
    );
    st.sliced = true;
    if (--b.pierce > 0) continue;
    travel = hit.t;
    break;
  }
  b.view.position.set(x + b.dx * travel, y + b.dy * travel);
  b.saw.rotation += BLADE_SPIN * dt;
  if (b.pierce <= 0) {
    // Thunk: it bites into the zombie, then drops and skids on along the floor, stopping short of a wall.
    ctx.fx.sparkle(b.view.x, b.view.y, STEEL_LIGHT, 3);
    const ahead = wallHit(b.view.x, b.view.y, b.dx, b.dy);
    spend(
      b,
      b.dx,
      b.dy,
      Math.min(
        def.skidDistance * rand(0.6, 1.4),
        ahead ? Math.max(0, ahead.t - b.radius) : Infinity,
      ),
      BLADE_SPIN,
    );
    return true;
  }
  if (wall && travel >= reach && reach < step) {
    // Thunk: it bites into the wall face, chips it and stays put for a moment, then drops off it
    // (along the wall's inward normal) onto the floor.
    b.stuck = STUCK_SECONDS;
    b.dx = wall.nx;
    b.dy = wall.ny;
    b.streak.visible = false;
    ctx.fx.sparkle(wall.x, wall.y, 0xffe08a, 4);
    ctx.floor.chipWall(wall.x, wall.y, wall.nx, wall.ny);
    return true;
  }
  // Out through a gate: gone once it's past the floor's margin, into the dark.
  const { x: nx, y: ny } = b.view;
  const m = ARENA.margin;
  return nx > -m && ny > -m && nx < ARENA.width + m && ny < ARENA.height + m;
}

/** Start a blade's drop and skid from where it is: `length` px along (dx, dy), spinning down from `spin`. */
function spend(
  b: Blade,
  dx: number,
  dy: number,
  length: number,
  spin: number,
): void {
  b.skid = 0;
  b.dx = dx;
  b.dy = dy;
  b.x0 = b.view.x;
  b.y0 = b.view.y;
  b.skidLength = length;
  b.spin0 = b.saw.rotation;
  b.spin = spin;
  b.streak.visible = false;
}

/**
 * A spent blade drops (fake height, growing a little while up), skids on along its flight line
 * slowing fast, its spin winding down, and blends from its flying look to the floor stamp's.
 * Stamped into the floor once settled. False then.
 */
function skid(ctx: PowerupContext, def: Def, b: Blade, dt: number): boolean {
  const a = (b.skid += dt);
  const settle = Math.max(0.01, def.settleSeconds);
  const f = Math.min(1, a / settle);
  const drop = Math.min(1, f / DROP_SHARE);
  const z = def.dropHeight * (1 - drop * drop);
  // On the floor once it lands: under the horde and the player, like the stamp it becomes.
  if (z <= 0 && b.view.parent !== ctx.ground) ctx.ground.addChild(b.view);
  const k = SKID_DECAY / settle;
  const decay = 1 - Math.exp(-k * a);
  b.view.position.set(
    b.x0 + b.dx * b.skidLength * decay,
    b.y0 + b.dy * b.skidLength * decay,
  );
  b.saw.rotation = b.spin0 + (b.spin / k) * decay;
  const look = f * f * (3 - 2 * f);
  b.saw.scale.set(
    b.radius * (1 + (SPENT_SCALE - 1) * look) * (1 + z * HEIGHT_SCALE),
  );
  b.saw.tint = lerpGrey(0xff, SPENT_TINT & 0xff, look);
  if (f < 1) return true;
  stampSpent(ctx, b);
  return false;
}

/** Burn a settled blade into the floor exactly as it lies: smaller and darker than in flight. */
function stampSpent(ctx: PowerupContext, b: Blade): void {
  if (!spentTexture) {
    const holder = new Container();
    holder
      .addChild(new Graphics({ context: BLADE }))
      .scale.set(SPENT_BAKE_RADIUS);
    spentTexture = ctx.floor.bake(holder);
    holder.destroy({ children: true });
  }
  ctx.floor.stampTexture(spentTexture, b.view.x, b.view.y, {
    rotation: b.saw.rotation,
    scale: (b.radius * SPENT_SCALE) / SPENT_BAKE_RADIUS,
    tint: SPENT_TINT,
  });
}

/** A grey tint between two channel levels. */
function lerpGrey(from: number, to: number, f: number): number {
  const c = Math.round(from + (to - from) * f);
  return (c << 16) | (c << 8) | c;
}

/** A blade stuck in a wall waits, then drops off it onto the floor, without spinning. */
function stick(b: Blade, dt: number): boolean {
  b.stuck -= dt;
  if (b.stuck <= 0) spend(b, b.dx, b.dy, b.radius * WALL_DROP, 0);
  return true;
}

function easeOutBack(f: number): number {
  const c = 1.7;
  const u = f - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

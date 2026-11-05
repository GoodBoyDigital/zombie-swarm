import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { LoopVoice } from "../../audio/Audio";
import { explode } from "../../combat/explosion";
import { EXPLOSIONS } from "../../config/explosions";
import type { EffectDef } from "../../config/powerups";
import { rand } from "../../core/random";
import type { ExclusionZone, Lure } from "../../entities/Horde";
import type { PowerupContext, PowerupEffect } from "../PowerupContext";

type Def = EffectDef<"decoy">;

/** The blow-up dummy, and the same dummy with the air let out, folded on the pump while arming. */
const DUMMY = "/sprites/decoy-dummy.png";
const FLAT = "/sprites/decoy-dummy-flat.png";
const ARM_LIGHT = 0xffb23a;
/** Pump spin, turns per second: idle once up, and the peak of the spin-up while arming. */
const SPIN_IDLE = 0.25;
const SPIN_ARMING = 3;
/** Arming light blink rate at the start and the end of arming, Hz. */
const BLINK_FROM = 3;
const BLINK_TO = 16;
/** The pump lands with a little pop: starting scale and seconds to settle. */
const DROP_SCALE = 1.6;
const DROP_SECONDS = 0.18;
/** Rings drawn in toward the pump while it charges, px out where they start and end. */
const CHARGE_RINGS = 3;
const CHARGE_RADIUS = 46;
const PUMP_RADIUS = 12;
/** The folded dummy on the pump: its size, and how hard it shudders by the end of arming. */
const FOLDED_SCALE = 0.55;
const FOLDED_SHAKE = 0.12;
/**
 * Deploying, like an airbag: it slams from folded to DEPLOY_OVERSHOOT in SNAP_SECONDS, then settles
 * with a fast damped wobble (decay per second, wobbles per second) and squash-stretch.
 */
const SNAP_SECONDS = 0.06;
const DEPLOY_OVERSHOOT = 1.3;
const SETTLE_DECAY = 12;
const SETTLE_HZ = 7;
const DEPLOY_STRETCH = 0.2;
/** The deploy's camera kick, and its puff of air and dust. */
const DEPLOY_TRAUMA = 0.3;
const DUST = 0xd9d2c3;
const BURST_SECONDS = 0.18;
/** Tube-man sway while up: lean (radians) and its rate, squash-stretch breathing and its rate. */
const LEAN = 0.14;
const LEAN_HZ = 0.55;
const BREATHE = 0.04;
const BREATHE_HZ = 1.3;
/** Jiggle spring: stiffness, damping, kick from each call going out, and from bumps (per zombie, capped per frame). */
const JIGGLE_STIFFNESS = 220;
const JIGGLE_DAMPING = 9;
const JIGGLE_CALL = 2.2;
const JIGGLE_BUMP = 0.12;
const JIGGLE_BUMP_MAX = 0.5;
/** Squeaks when bumped: seconds between them at the least, and the chance one plays when it can. */
const SQUEAK_GAP = 0.7;
const SQUEAK_CHANCE = 0.35;
/** About to pop: how much it swells over `warnSeconds` and how much faster it sways by the end. */
const WARN_SWELL = 0.15;
const WARN_RATE = 3;
/** The beat of tension right before the pop: seconds, extra swell, and the tremble on top. */
const SWELL_SECONDS = 0.2;
const SWELL_POP = 0.35;
const SWELL_TREMBLE = 0.06;
/** Glints thrown out by the pop, in white and the dummy's blue. */
const POP_GLINT = 0x5aa2ff;
/** The spent pump left on the floor. */
const DEAD_TINT = 0x6a6f6a;
/** Keep-out edge: the pulsing ring and the glow inside it, drawn over the pile. */
const GLOW_SHARE = 0.7;
const RING_COLOR = 0xffe14a;
/** Air blast disc thrown out as it deploys, px across at its widest. */
const BURST_RADIUS = 80;
/** Call fronts: trailing bands behind the bright edge, their spacing px, and the colours. */
const FRONT_BANDS = 4;
const FRONT_BAND_GAP = 14;
const FRONT_COLOR = 0x5ff2ff;
const FRONT_EDGE = 0xe8ffff;
const HUM_VOLUME = 0.25;

interface DecoyState {
  x: number;
  y: number;
  /** Seconds of arming left; it inflates at 0. */
  armLeft: number;
  /** Set on the horde while it's up; zombies hunt it once a call front has reached them. */
  lure: Lure;
  on: boolean;
  /** Seconds since it last inflated. */
  onFor: number;
  /** Keeps zombies off it while it's up. */
  zone: ExclusionZone | null;
  /** Floor layer: pump, its light and the folded dummy while arming. */
  floor: Container;
  puck: Sprite;
  light: Graphics;
  folded: Sprite;
  /** World layer over the horde, so the swarm piling in never hides it: rings, fronts and the dummy. */
  top: Container;
  halo: Graphics;
  dummy: Sprite;
  /** Which way it faces: the player's aim when it went down. */
  facing: number;
  /** Squash-stretch spring, value and velocity. */
  jiggle: number;
  jiggleV: number;
  /** Sway clock, seconds; runs faster as it gets ready to pop. */
  sway: number;
  /** The squeak of tension before the pop has played. */
  squeaked: boolean;
  /** Zombies pressed on the keep-out edge this frame, counted by the zone. */
  bumps: number;
  squeakIn: number;
  /** Radii of the call fronts still travelling out, world px. */
  fronts: number[];
  pulseIn: number;
  hum: LoopVoice | null;
}

/**
 * Decoy: a pump lands where the orb was with a folded blow-up dummy of the player on it. It charges
 * for a moment (spinning up, blinking, beeping, hissing), then the dummy slams out like an airbag and
 * sends out a call: a wavefront travelling out to `lureRadius`. Each zombie the front reaches drops
 * the player and hunts the dummy until it pops. It calls again every `pulseSeconds`, catching
 * anyone new, and wobbles about like a tube man, jiggling on every call and every shove. Nothing
 * gets within `keepOutRadius` of it. In its last `warnSeconds` it swells and sways faster; then it
 * bursts, knocking the pile back and littering the floor with shreds. A repeat pickup tops it up.
 */
export const decoy: PowerupEffect<Def, DecoyState> = {
  start(ctx, def, active) {
    const { x, y } = active.origin;
    const floor = new Container({ label: "decoy" });
    floor.position.set(x, y);
    const puck = new Sprite({
      texture: Assets.get<Texture>(def.sprite),
      anchor: 0.5,
    });
    const light = new Graphics().circle(0, 0, 3.5).fill(0xffffff);
    const facing = ctx.player.aim;
    const folded = new Sprite({
      texture: Assets.get<Texture>(FLAT),
      anchor: 0.5,
      rotation: facing,
    });
    folded.scale.set(FOLDED_SCALE);
    floor.addChild(puck, folded, light);
    ctx.ground.addChild(floor);

    const top = new Container({ label: "decoyDummy" });
    top.position.set(x, y);
    const halo = new Graphics();
    halo.blendMode = "add";
    const dummy = new Sprite({
      texture: Assets.get<Texture>(DUMMY),
      anchor: 0.5,
      rotation: facing,
    });
    dummy.visible = false;
    top.addChild(halo, dummy);
    ctx.world.addChild(top);

    ctx.audio.play("decoyArm", { volume: 0.7 });
    ctx.audio.play("decoyPump", { volume: 0.5 });
    ctx.fx.sparkle(x, y, ARM_LIGHT, 6);
    active.state = {
      x,
      y,
      armLeft: def.armSeconds,
      lure: { x, y, radius: def.keepOutRadius },
      on: false,
      onFor: 0,
      zone: null,
      floor,
      puck,
      light,
      folded,
      top,
      halo,
      dummy,
      facing,
      jiggle: 0,
      jiggleV: 0,
      sway: 0,
      squeaked: false,
      bumps: 0,
      squeakIn: 0,
      fronts: [],
      pulseIn: 0,
      hum: null,
    };
    active.windup = 1;
  },

  update(ctx, def, dt, active) {
    const st = active.state;
    st.lure.radius = def.keepOutRadius;
    if (!st.on) {
      st.armLeft -= dt;
      // The active time only starts counting once it's up.
      active.left = def.seconds;
      active.windup =
        def.armSeconds > 0 ? Math.max(0, st.armLeft) / def.armSeconds : 0;
      if (st.armLeft <= 0) inflate(ctx, def, st);
    }
    if (st.on) st.onFor += dt;

    drawPump(def, dt, active.age, st);
    st.halo.clear();
    if (!st.on) drawCharge(def, st);
    else {
      call(ctx, def, dt, active.age, st);
      wobble(ctx, def, dt, active.left, st);
    }
  },

  // Time's up, or cut short (death, boarding, restart): it pops on the spot.
  end(ctx, def, active) {
    const st = active.state;
    if (ctx.horde.lure === st.lure) ctx.horde.lure = null;
    if (st.zone) ctx.horde.removeZone(st.zone);
    st.hum?.stop();
    if (st.on) pop(ctx, def, st);
    else ctx.fx.sparkle(st.x, st.y, ARM_LIGHT, 8);
    ctx.floor.stampTexture(st.puck.texture, st.x, st.y, {
      rotation: st.puck.rotation,
      tint: DEAD_TINT,
    });
    st.floor.destroy({ children: true });
    st.top.destroy({ children: true });
  },
};

/** Bang: a push-only blast knocks the pile back, and shreds of vinyl fly out to litter the floor. */
function pop(ctx: PowerupContext, def: Def, st: DecoyState): void {
  explode(ctx, st.x, st.y, EXPLOSIONS[def.explosion]);
  ctx.casings.shreds(
    st.x,
    st.y,
    def.shreds,
    def.shredSpeed,
    def.shredLift,
    def.shredSpin,
    def.shredScale,
    def.shredEyeScale,
  );
  ctx.fx.sparkle(st.x, st.y, 0xffffff, 12);
  ctx.fx.sparkle(st.x, st.y, POP_GLINT, 10);
}

/** Bang, it's up: the dummy slams out of the pump like an airbag, the keep-out opens, and the first call goes once it's settled. */
function inflate(ctx: PowerupContext, def: Def, st: DecoyState): void {
  st.on = true;
  st.onFor = 0;
  st.dummy.visible = true;
  st.folded.visible = false;
  ctx.horde.lure = st.lure;
  // The player walks through it freely, and isn't sheltered inside it.
  st.zone = ctx.horde.addZone(st.x, st.y, 0, false);
  st.zone.onContact = () => st.bumps++;
  ctx.audio.play("decoyDeploy", { volume: 1 });
  st.hum = ctx.audio.loopVoice("decoyHum", HUM_VOLUME);
  ctx.camera.addTrauma(DEPLOY_TRAUMA);
  ctx.fx.sparkle(st.x, st.y, 0xffffff, 12);
  ctx.fx.sparkle(st.x, st.y, DUST, 16);
  st.pulseIn = def.springSeconds;
  st.fronts.length = 0;
}

/** Spin (winding up while arming), the landing pop, the arming light and the folded dummy shuddering as pressure builds. */
function drawPump(def: Def, dt: number, age: number, st: DecoyState): void {
  const arming = armed(def, st);
  const spin = st.on ? SPIN_IDLE : SPIN_ARMING * arming * arming;
  st.puck.rotation += spin * Math.PI * 2 * dt;
  const drop = Math.min(1, age / DROP_SECONDS);
  st.puck.scale.set(DROP_SCALE + (1 - DROP_SCALE) * drop * (2 - drop));
  const rate = BLINK_FROM + (BLINK_TO - BLINK_FROM) * arming;
  st.light.tint = st.on ? RING_COLOR : ARM_LIGHT;
  st.light.alpha = st.on || (age * rate) % 1 < 0.5 ? 1 : 0.15;
  if (st.on) return;
  const shake = FOLDED_SHAKE * arming * arming * Math.sin(age * rate * Math.PI);
  st.folded.scale.set(
    FOLDED_SCALE * (1 + shake),
    FOLDED_SCALE * (1 - shake * 0.6),
  );
}

/** Rings drawn in toward the pump while it charges. */
function drawCharge(def: Def, st: DecoyState): void {
  const arming = armed(def, st);
  const g = st.halo;
  for (let i = 0; i < CHARGE_RINGS; i++) {
    const t = (arming * 3 + i / CHARGE_RINGS) % 1;
    const r = CHARGE_RADIUS - (CHARGE_RADIUS - PUMP_RADIUS) * t * t;
    g.circle(0, 0, r).stroke({
      width: 2.5,
      color: ARM_LIGHT,
      alpha: 0.7 * arming * Math.sin(t * Math.PI),
    });
  }
}

/**
 * While up: open the keep-out, flash the inflate burst, send out a call front every `pulseSeconds`
 * (each capturing the zombies it sweeps over this frame) and pulse the keep-out edge.
 */
function call(
  ctx: PowerupContext,
  def: Def,
  dt: number,
  age: number,
  st: DecoyState,
): void {
  const g = st.halo;
  const edge = def.keepOutRadius * Math.min(1, deployScale(st.onFor));
  if (st.zone) st.zone.radius = edge;
  const burst = st.onFor / BURST_SECONDS;
  if (burst < 1) {
    const r = BURST_RADIUS * (1 - (1 - burst) * (1 - burst));
    g.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.45 * (1 - burst) });
  }

  st.pulseIn -= dt;
  if (st.pulseIn <= 0) {
    st.pulseIn = def.pulseSeconds;
    st.fronts.push(0);
    st.jiggleV += JIGGLE_CALL;
  }
  // Fronts travel on the world clock, so slow-mo slows the sweep with the crowd.
  const step = def.pulseSpeed * dt * ctx.timeScale;
  for (let i = st.fronts.length - 1; i >= 0; i--) {
    const from = st.fronts[i];
    const to = Math.min(def.lureRadius, from + step);
    ctx.horde.capture(st.lure, from, to);
    if (to >= def.lureRadius) {
      st.fronts.splice(i, 1);
      continue;
    }
    st.fronts[i] = to;
    drawFront(g, def, to);
  }

  const pulse = 0.5 + 0.5 * Math.sin(age * Math.PI * 2 * 2);
  g.circle(0, 0, edge * GLOW_SHARE)
    .fill({ color: RING_COLOR, alpha: 0.1 + 0.08 * pulse })
    .circle(0, 0, edge)
    .stroke({
      width: 2.5 + 1.5 * pulse,
      color: RING_COLOR,
      alpha: 0.5 + 0.3 * pulse,
    });
}

/** A call front: a bright leading edge with fainter bands trailing inside it, fading near full reach. */
function drawFront(g: Graphics, def: Def, r: number): void {
  const t = r / def.lureRadius;
  const life = 1 - t * t;
  for (let k = FRONT_BANDS; k >= 1; k--) {
    const br = r - k * FRONT_BAND_GAP;
    if (br <= 0) continue;
    g.circle(0, 0, br).stroke({
      width: FRONT_BAND_GAP,
      color: FRONT_COLOR,
      alpha: 0.16 * (1 - k / (FRONT_BANDS + 1)) * life,
    });
  }
  g.circle(0, 0, r)
    .stroke({ width: 8, color: FRONT_COLOR, alpha: 0.55 * life })
    .circle(0, 0, r)
    .stroke({ width: 3, color: FRONT_EDGE, alpha: 0.95 * life });
}

/**
 * Deployed: slams out and settles with a damped squash-and-stretch (deployScale), then leans and
 * breathes like a tube man, with the jiggle spring (kicked by calls and bumps) on top. In its last
 * `warnSeconds` it swells and sways faster, then strains for a beat with a squeak before it pops.
 */
function wobble(
  ctx: PowerupContext,
  def: Def,
  dt: number,
  left: number,
  st: DecoyState,
): void {
  // Bumps from the crowd on the edge: a nudge per zombie, capped, and the odd squeak.
  st.squeakIn -= dt;
  if (st.bumps > 0) {
    st.jiggleV +=
      Math.min(JIGGLE_BUMP_MAX, st.bumps * JIGGLE_BUMP) * rand(-1, 1);
    if (st.squeakIn <= 0 && Math.random() < SQUEAK_CHANCE) {
      st.squeakIn = SQUEAK_GAP;
      ctx.audio.play("decoySqueak", { volume: 0.45, pitch: rand(0.85, 1.3) });
    }
  }
  st.bumps = 0;
  st.jiggleV +=
    (-JIGGLE_STIFFNESS * st.jiggle - JIGGLE_DAMPING * st.jiggleV) * dt;
  st.jiggle += st.jiggleV * dt;

  const warn =
    def.warnSeconds > 0 ? Math.max(0, 1 - left / def.warnSeconds) : 0;
  const strain = Math.max(0, 1 - left / SWELL_SECONDS);
  if (strain > 0 && !st.squeaked) {
    st.squeaked = true;
    ctx.audio.play("decoySqueak", { volume: 0.6, pitch: 1.7 });
  } else if (strain === 0) st.squeaked = false;
  st.sway += dt * (1 + WARN_RATE * warn);
  const t = st.sway;
  const spring = springAt(def, st);
  const grow =
    deployScale(st.onFor) * (1 + WARN_SWELL * warn + SWELL_POP * strain);
  const settle = Math.max(0, st.onFor - SNAP_SECONDS);
  const stretch =
    DEPLOY_STRETCH *
    Math.exp(-settle * SETTLE_DECAY) *
    Math.sin(settle * SETTLE_HZ * Math.PI * 2);
  const breathe = BREATHE * Math.sin(t * BREATHE_HZ * Math.PI * 2);
  const tremble = SWELL_TREMBLE * strain * Math.sin(st.onFor * 90);
  const squash = stretch + breathe + st.jiggle + tremble;
  st.dummy.scale.set(grow * (1 + squash), grow * (1 - squash));
  st.dummy.rotation =
    st.facing +
    LEAN * Math.sin(t * LEAN_HZ * Math.PI * 2) * Math.min(1, spring * 2) +
    st.jiggle * 0.6;
}

/** Share of arming done, 0 to 1. */
function armed(def: Def, st: DecoyState): number {
  return def.armSeconds > 0 ? 1 - Math.max(0, st.armLeft) / def.armSeconds : 1;
}

/** Share of the settle before the first call, 0 to 1; 0 while still arming. */
function springAt(def: Def, st: DecoyState): number {
  if (!st.on) return 0;
  return def.springSeconds > 0 ? Math.min(1, st.onFor / def.springSeconds) : 1;
}

/** Size `t` seconds after deploying: folded to past full in SNAP_SECONDS, then a quick damped wobble down to 1. */
function deployScale(t: number): number {
  if (t < SNAP_SECONDS) {
    const k = t / SNAP_SECONDS;
    return FOLDED_SCALE + (DEPLOY_OVERSHOOT - FOLDED_SCALE) * k * (2 - k);
  }
  const u = t - SNAP_SECONDS;
  return (
    1 +
    (DEPLOY_OVERSHOOT - 1) *
      Math.exp(-u * SETTLE_DECAY) *
      Math.cos(u * SETTLE_HZ * Math.PI * 2)
  );
}

import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import type { LoopVoice } from "../../audio/Audio";
import type { EffectDef } from "../../config/powerups";
import { rand } from "../../core/random";
import type { ExclusionZone, Lure } from "../../entities/Horde";
import type { PowerupContext, PowerupEffect } from "../PowerupContext";

type Def = EffectDef<"decoy">;

const ARM_LIGHT = 0xffb23a;
/** Puck spin, turns per second: idle once on, and the peak of the spin-up while arming. */
const SPIN_IDLE = 0.25;
const SPIN_ARMING = 3;
/** Arming light blink rate at the start and the end of arming, Hz. */
const BLINK_FROM = 3;
const BLINK_TO = 16;
/** The puck lands with a little pop: starting scale and seconds to settle. */
const DROP_SCALE = 1.6;
const DROP_SECONDS = 0.18;
/** Rings drawn in toward the puck while it charges, px out where they start. */
const CHARGE_RINGS = 3;
const CHARGE_RADIUS = 46;
/** The puck's radius, px, where the charge rings close in to. */
const PUCK_RADIUS = 12;
/** Hologram scanlines: rows across the sprite and the share of each row left dark. */
const SCAN_ROWS = 10;
const SCAN_GAP = 0.18;
const HOLO_ALPHA = 0.85;
/** The hologram is the player's white silhouette in scanlines, tinted, with his art glowing faintly through. */
const SILHOUETTE = "/sprites/player-flash.png";
const DETAIL = "/sprites/player.png";
const SILHOUETTE_ALPHA = 0.95;
const DETAIL_ALPHA = 0.6;
/** Ink outline: the silhouette again, dark and this much bigger, behind the scanlines. */
const OUTLINE_SCALE = 1.14;
const OUTLINE_ALPHA = 0.85;
const INK = 0x151a15;
/** Gentle breathing pulse on the hologram's size, Hz and share. */
const BOB_HZ = 1.6;
const BOB = 0.05;
/** A touch bigger than the player, so it reads over the pile. */
const HOLO_SCALE = 1.3;
/** Seconds between glitches (a row jumping sideways), and how far it jumps, px. */
const GLITCH_MIN = 0.15;
const GLITCH_MAX = 0.6;
const GLITCH_SHIFT = 3;
/** The hologram turns to face the nearest zombie within this, world px, rechecked this often. */
const FACE_RADIUS = 260;
const FACE_INTERVAL = 0.25;
const FACE_RATE = 5;
/** Pulsing ring along the keep-out edge, and the glow inside it, drawn over the pile. */
const GLOW_SHARE = 0.7;
/** Spring-up: peak overshoot of the hologram's size, how high it hops (px), and the puck's squash. */
const SPRING_OVERSHOOT = 1.6;
const SPRING_HOP = 14;
const SPRING_SQUASH = 0.25;
/** Flash disc thrown out by the spring-up, px across at its widest. */
const BURST_RADIUS = 70;
/** Call fronts: trailing bands behind the bright edge, their spacing px, and the edge's colour. */
const FRONT_BANDS = 4;
const FRONT_BAND_GAP = 14;
const FRONT_EDGE = 0xe8ffff;
const HUM_VOLUME = 0.35;
/** The dead puck left on the floor. */
const DEAD_TINT = 0x6a6f6a;

interface DecoyState {
  x: number;
  y: number;
  /** Seconds of arming left; it springs up at 0. */
  armLeft: number;
  /** Set on the horde once it springs up; zombies hunt it once a call front has reached them. */
  lure: Lure;
  on: boolean;
  /** Seconds since it sprang up. */
  onFor: number;
  /** Keeps zombies off the puck from the spring-up on. */
  zone: ExclusionZone | null;
  /** Floor layer: puck and its light. */
  floor: Container;
  puck: Sprite;
  light: Graphics;
  /** World layer over the horde, so the swarm piling in never hides it: charge rings, call fronts, keep-out edge and the hologram. */
  top: Container;
  halo: Graphics;
  holo: Container;
  rows: Sprite[];
  /** Each row's resting x, so a glitched row can jump back. */
  rowX: number[];
  /** Radii of the call fronts still travelling out, world px. */
  fronts: number[];
  pulseIn: number;
  glitchIn: number;
  glitchRow: number;
  faceIn: number;
  faceTo: number;
  hum: LoopVoice | null;
}

/**
 * Decoy: a projector puck lands where the orb was. It charges for a moment (spinning up, blinking,
 * beeping), then springs up a hologram of the player and sends out a call: a wavefront travelling
 * out to `lureRadius`. Each zombie the front reaches drops the player and hunts the decoy, and
 * keeps at it until the decoy dies. It calls again every `pulseSeconds`, catching anyone new. Nothing
 * gets within `keepOutRadius` of it; the crowd piles up round that edge. A repeat pickup tops up
 * the running decoy rather than placing a second.
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
    floor.addChild(puck, light);
    ctx.ground.addChild(floor);

    const top = new Container({ label: "decoyHologram" });
    top.position.set(x, y);
    const halo = new Graphics();
    halo.blendMode = "add";
    const holo = new Container();
    holo.visible = false;
    top.addChild(halo, holo);
    const anchor = ctx.player.body.anchor;
    const silhouette = Assets.get<Texture>(SILHOUETTE);
    const outline = new Sprite({
      texture: silhouette,
      anchor,
      tint: INK,
      alpha: OUTLINE_ALPHA,
    });
    outline.scale.set(OUTLINE_SCALE);
    holo.addChild(outline);
    const rows = scanRows(silhouette, anchor).map(({ texture, x, y }) => {
      const row = new Sprite({ texture, tint: def.holoColor, x, y });
      row.alpha = SILHOUETTE_ALPHA;
      holo.addChild(row);
      return row;
    });
    const detail = new Sprite({
      texture: Assets.get<Texture>(DETAIL),
      anchor,
      tint: def.holoColor,
      alpha: DETAIL_ALPHA,
    });
    detail.blendMode = "add";
    holo.addChild(detail);
    ctx.world.addChild(top);

    ctx.audio.play("decoyArm", { volume: 0.7 });
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
      top,
      halo,
      holo,
      rows,
      rowX: rows.map((r) => r.x),
      fronts: [],
      pulseIn: 0,
      glitchIn: GLITCH_MAX,
      glitchRow: -1,
      faceIn: 0,
      faceTo: ctx.player.aim,
      hum: null,
    };
    active.windup = 1;
  },

  update(ctx, def, dt, active) {
    const st = active.state;
    st.lure.radius = def.keepOutRadius;
    if (!st.on) {
      st.armLeft -= dt;
      // The active time only starts counting once it's on.
      active.left = def.seconds;
      active.windup =
        def.armSeconds > 0 ? Math.max(0, st.armLeft) / def.armSeconds : 0;
      if (st.armLeft <= 0) switchOn(ctx, def, st);
    }
    if (st.on) st.onFor += dt;
    drawPuck(def, dt, active.age, st);
    st.halo.clear();
    if (st.on) {
      call(ctx, def, dt, active.age, active.left, st);
      updateHologram(ctx, def, dt, active.left, st);
    } else drawCharge(def, st);
  },

  end(ctx, def, active) {
    const st = active.state;
    if (ctx.horde.lure === st.lure) ctx.horde.lure = null;
    if (st.zone) ctx.horde.removeZone(st.zone);
    st.hum?.stop();
    ctx.fx.sparkle(st.x, st.y, def.holoColor, 16);
    ctx.fx.sparkle(st.x, st.y, ARM_LIGHT, 8);
    ctx.audio.play("decoyOff", { volume: 0.8 });
    // The burnt-out puck stays on the floor with the rest of the mess.
    ctx.floor.stampTexture(st.puck.texture, st.x, st.y, {
      rotation: st.puck.rotation,
      tint: DEAD_TINT,
    });
    // The slices are this decoy's own textures; the rest are shared atlas frames.
    for (const row of st.rows) row.texture.destroy();
    st.floor.destroy({ children: true });
    st.top.destroy({ children: true });
  },
};

/** Spring up: the hologram pops out, the keep-out opens, and the first call goes once it lands. */
function switchOn(ctx: PowerupContext, def: Def, st: DecoyState): void {
  st.on = true;
  st.holo.visible = true;
  ctx.horde.lure = st.lure;
  // The player walks through it freely, and isn't sheltered inside it.
  st.zone = ctx.horde.addZone(st.x, st.y, 0, false);
  ctx.audio.play("decoyOn", { volume: 0.8 });
  st.hum = ctx.audio.loopVoice("decoyHum", HUM_VOLUME);
  ctx.fx.sparkle(st.x, st.y, 0xffffff, 14);
  ctx.fx.sparkle(st.x, st.y, def.holoColor, 10);
  st.pulseIn = def.springSeconds;
}

/** Spin (winding up while arming), the landing pop and the spring-up squash, and the arming light. */
function drawPuck(def: Def, dt: number, age: number, st: DecoyState): void {
  const arming = armed(def, st);
  const spin = st.on ? SPIN_IDLE : SPIN_ARMING * arming * arming;
  st.puck.rotation += spin * Math.PI * 2 * dt;
  const drop = Math.min(1, age / DROP_SECONDS);
  const spring = springAt(def, st);
  const squash = spring < 1 ? SPRING_SQUASH * Math.sin(spring * Math.PI) : 0;
  st.puck.scale.set(
    (DROP_SCALE + (1 - DROP_SCALE) * drop * (2 - drop)) * (1 - squash),
  );
  const rate = BLINK_FROM + (BLINK_TO - BLINK_FROM) * arming;
  st.light.tint = st.on ? def.holoColor : ARM_LIGHT;
  st.light.alpha = st.on || (age * rate) % 1 < 0.5 ? 1 : 0.15;
}

/** Rings drawn in toward the puck while it charges. */
function drawCharge(def: Def, st: DecoyState): void {
  const arming = armed(def, st);
  const g = st.halo;
  for (let i = 0; i < CHARGE_RINGS; i++) {
    const t = (arming * 3 + i / CHARGE_RINGS) % 1;
    const r = CHARGE_RADIUS - (CHARGE_RADIUS - PUCK_RADIUS) * t * t;
    g.circle(0, 0, r).stroke({
      width: 2.5,
      color: ARM_LIGHT,
      alpha: 0.7 * arming * Math.sin(t * Math.PI),
    });
  }
}

/**
 * Once sprung: open the keep-out, flash the spring-up burst, send out a call front every
 * `pulseSeconds` (each capturing the zombies it sweeps over this frame) and pulse the keep-out edge.
 */
function call(
  ctx: PowerupContext,
  def: Def,
  dt: number,
  age: number,
  left: number,
  st: DecoyState,
): void {
  const g = st.halo;
  const fade = flicker(age, left, def.flickerSeconds);
  const spring = springAt(def, st);
  if (st.zone) {
    st.zone.radius = def.keepOutRadius * Math.min(1, easeOutBack(spring));
  }
  if (spring < 1) {
    const r = BURST_RADIUS * (1 - (1 - spring) * (1 - spring));
    g.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.35 * (1 - spring) });
  }

  st.pulseIn -= dt;
  if (st.pulseIn <= 0) {
    st.pulseIn = def.pulseSeconds;
    st.fronts.push(0);
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
    drawFront(g, def, to, fade);
  }

  const pulse = 0.5 + 0.5 * Math.sin(age * Math.PI * 2 * 2);
  const edge = def.keepOutRadius * Math.min(1, easeOutBack(spring));
  g.circle(0, 0, edge * GLOW_SHARE)
    .fill({ color: def.holoColor, alpha: (0.15 + 0.1 * pulse) * fade })
    .circle(0, 0, edge)
    .stroke({
      width: 2.5 + 1.5 * pulse,
      color: def.holoColor,
      alpha: (0.5 + 0.3 * pulse) * fade,
    });
}

/** A call front: a bright leading edge with fainter bands trailing inside it, fading near full reach. */
function drawFront(g: Graphics, def: Def, r: number, fade: number): void {
  const t = r / def.lureRadius;
  const life = (1 - t * t) * fade;
  for (let k = FRONT_BANDS; k >= 1; k--) {
    const br = r - k * FRONT_BAND_GAP;
    if (br <= 0) continue;
    g.circle(0, 0, br).stroke({
      width: FRONT_BAND_GAP,
      color: def.holoColor,
      alpha: 0.16 * (1 - k / (FRONT_BANDS + 1)) * life,
    });
  }
  g.circle(0, 0, r)
    .stroke({ width: 8, color: def.holoColor, alpha: 0.55 * life })
    .circle(0, 0, r)
    .stroke({ width: 3, color: FRONT_EDGE, alpha: 0.95 * life });
}

/** Share of arming done, 0 to 1. */
function armed(def: Def, st: DecoyState): number {
  return def.armSeconds > 0 ? 1 - Math.max(0, st.armLeft) / def.armSeconds : 1;
}

/** Share of the spring-up done, 0 to 1; 0 while still arming. */
function springAt(def: Def, st: DecoyState): number {
  if (!st.on) return 0;
  return def.springSeconds > 0 ? Math.min(1, st.onFor / def.springSeconds) : 1;
}

/** Overshoots a little before settling. */
function easeOutBack(t: number): number {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/** Boot flicker, scanline glitches, turning to face the nearest zombie, and dying flicker. */
function updateHologram(
  ctx: PowerupContext,
  def: Def,
  dt: number,
  left: number,
  st: DecoyState,
): void {
  const holo = st.holo;
  const onFor = st.onFor;
  const spring = springAt(def, st);
  // Springs up: grows past full size and settles, hopping up and landing as it goes.
  const pop = spring < 1 ? springScale(spring) : 1;
  const bob =
    HOLO_SCALE * pop * (1 + BOB * Math.sin(onFor * BOB_HZ * Math.PI * 2));
  holo.scale.set(bob);
  holo.y = spring < 1 ? -SPRING_HOP * Math.sin(spring * Math.PI) : 0;

  st.faceIn -= dt;
  if (st.faceIn <= 0) {
    st.faceIn = FACE_INTERVAL;
    st.faceTo = nearestZombieAngle(ctx, st.x, st.y) ?? st.faceTo;
  }
  let turn = st.faceTo - holo.rotation;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  holo.rotation += turn * Math.min(1, dt * FACE_RATE);

  // A row jumps sideways now and then; more often as it dies.
  st.glitchIn -= dt;
  if (st.glitchRow >= 0) st.rows[st.glitchRow].x = st.rowX[st.glitchRow];
  st.glitchRow = -1;
  if (st.glitchIn <= 0 && st.rows.length > 0) {
    const dying = left < def.flickerSeconds;
    st.glitchIn = rand(GLITCH_MIN, GLITCH_MAX) * (dying ? 0.3 : 1);
    st.glitchRow = Math.floor(Math.random() * st.rows.length);
    st.rows[st.glitchRow].x += rand(-GLITCH_SHIFT, GLITCH_SHIFT);
  }
  const shimmer = 0.85 + 0.15 * Math.sin(onFor * 37) * Math.sin(onFor * 13);
  holo.alpha =
    HOLO_ALPHA *
    shimmer *
    (spring < 0.4 ? (Math.random() < 0.5 ? 0.4 : 1) : 1) *
    flicker(onFor, left, def.flickerSeconds);
  st.hum?.volume(
    HUM_VOLUME * (left < def.flickerSeconds ? left / def.flickerSeconds : 1),
  );
}

/** 0 up past SPRING_OVERSHOOT, then a damped wobble down to 1. */
function springScale(t: number): number {
  const rise = 0.35;
  if (t < rise) return SPRING_OVERSHOOT * Math.sin(((t / rise) * Math.PI) / 2);
  const u = (t - rise) / (1 - rise);
  return (
    1 + (SPRING_OVERSHOOT - 1) * Math.cos(u * Math.PI * 2.5) * (1 - u) * (1 - u)
  );
}

/** Steady until the last `seconds`, then blinking faster and dimmer as time runs out. */
function flicker(age: number, left: number, seconds: number): number {
  if (left >= seconds || seconds <= 0) return 1;
  const t = Math.max(0, left) / seconds;
  const rate = 5 + 20 * (1 - t);
  return (age * rate) % 1 < 0.45 + 0.4 * t ? 1 : 0.2;
}

function nearestZombieAngle(
  ctx: PowerupContext,
  x: number,
  y: number,
): number | null {
  let best = FACE_RADIUS * FACE_RADIUS;
  let angle: number | null = null;
  ctx.horde.hash.queryBox(
    x - FACE_RADIUS,
    y - FACE_RADIUS,
    x + FACE_RADIUS,
    y + FACE_RADIUS,
    (z) => {
      const dx = z.x - x;
      const dy = z.y - y;
      const d2 = dx * dx + dy * dy;
      if (z.dead || d2 >= best) return;
      best = d2;
      angle = Math.atan2(dy, dx);
    },
  );
  return angle;
}

/**
 * Horizontal slices of a texture with gaps between them, for hologram scanlines, each with its
 * offset from the anchor. Works in the untrimmed space so the slices line up with the
 * original whatever the atlas trimmed. Each slice is a new texture; destroy them with the sprites.
 */
function scanRows(
  tex: Texture,
  anchor: { x: number; y: number },
): { texture: Texture; x: number; y: number }[] {
  const { frame, orig } = tex;
  const trim = tex.trim ?? new Rectangle(0, 0, orig.width, orig.height);
  const ox = anchor.x * orig.width;
  const oy = anchor.y * orig.height;
  const step = orig.height / SCAN_ROWS;
  const rows: { texture: Texture; x: number; y: number }[] = [];
  for (let i = 0; i < SCAN_ROWS; i++) {
    const top = Math.max(i * step, trim.y);
    const bottom = Math.min((i + 1 - SCAN_GAP) * step, trim.y + trim.height);
    if (bottom <= top) continue;
    const slice = new Rectangle(
      frame.x,
      frame.y + top - trim.y,
      frame.width,
      bottom - top,
    );
    rows.push({
      texture: new Texture({ source: tex.source, frame: slice }),
      x: trim.x - ox,
      y: top - oy,
    });
  }
  return rows;
}

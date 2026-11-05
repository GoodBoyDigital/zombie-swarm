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
import type { Lure } from "../../entities/Horde";
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
/** Seconds for the hologram to flicker into being once it switches on. */
const BOOT_SECONDS = 0.25;
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
/** Pulsing lure ring and glow round the puck, drawn over the pile. */
const LURE_RING = 34;
const GLOW_RADIUS = 30;
/** Seconds a call ring takes to reach `lureRadius`. */
const CALL_SECONDS = 1.1;
const HUM_VOLUME = 0.35;
/** The dead puck left on the floor. */
const DEAD_TINT = 0x6a6f6a;

interface DecoyState {
  x: number;
  y: number;
  /** Seconds of arming left; it switches on at 0. */
  armLeft: number;
  /** Set on the horde once armed. */
  lure: Lure;
  on: boolean;
  /** Floor layer: puck, its light and the call rings. */
  floor: Container;
  calls: Graphics;
  puck: Sprite;
  light: Graphics;
  /** World layer over the horde, so the swarm piling in never hides it: charge or lure rings, and the hologram. */
  top: Container;
  halo: Graphics;
  holo: Container;
  rows: Sprite[];
  /** Each row's resting x, so a glitched row can jump back. */
  rowX: number[];
  /** Ages of the call rings still expanding. */
  callAges: number[];
  pulseIn: number;
  glitchIn: number;
  glitchRow: number;
  faceIn: number;
  faceTo: number;
  hum: LoopVoice | null;
}

/**
 * Decoy: a projector puck lands where the orb was. It arms for a moment (spinning up, blinking,
 * beeping), then throws up a hologram of the player. While it runs the horde hunts it instead of
 * him: every chaser turns for it, and it calls out every so often, pulling in wanderers from far
 * around. A repeat pickup tops up the running decoy rather than placing a second.
 */
export const decoy: PowerupEffect<Def, DecoyState> = {
  start(ctx, def, active) {
    const { x, y } = active.origin;
    const floor = new Container({ label: "decoy" });
    floor.position.set(x, y);
    const calls = new Graphics();
    calls.blendMode = "add";
    const puck = new Sprite({
      texture: Assets.get<Texture>(def.sprite),
      anchor: 0.5,
    });
    const light = new Graphics().circle(0, 0, 3.5).fill(0xffffff);
    floor.addChild(calls, puck, light);
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
      lure: { x, y, radius: def.bodyRadius },
      on: false,
      floor,
      calls,
      puck,
      light,
      top,
      halo,
      holo,
      rows,
      rowX: rows.map((r) => r.x),
      callAges: [],
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
    st.lure.radius = def.bodyRadius;
    if (!st.on) {
      st.armLeft -= dt;
      // The active time only starts counting once it's on.
      active.left = def.seconds;
      active.windup =
        def.armSeconds > 0 ? Math.max(0, st.armLeft) / def.armSeconds : 0;
      if (st.armLeft <= 0) switchOn(ctx, st);
    }
    drawFloor(ctx, def, dt, active.age, active.left, st);
    if (st.on) updateHologram(ctx, def, dt, active.left, st);
  },

  end(ctx, def, active) {
    const st = active.state;
    if (ctx.horde.lure === st.lure) ctx.horde.lure = null;
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

function switchOn(ctx: PowerupContext, st: DecoyState): void {
  st.on = true;
  st.holo.visible = true;
  ctx.horde.lure = st.lure;
  ctx.audio.play("decoyOn", { volume: 0.8 });
  st.hum = ctx.audio.loopVoice("decoyHum", HUM_VOLUME);
  ctx.fx.sparkle(st.x, st.y, 0xffffff, 12);
  st.pulseIn = 0;
}

/** Puck spin and pop, arming light, charge rings while arming; lure ring and call rings once on. */
function drawFloor(
  ctx: PowerupContext,
  def: Def,
  dt: number,
  age: number,
  left: number,
  st: DecoyState,
): void {
  const arming =
    def.armSeconds > 0 ? 1 - Math.max(0, st.armLeft) / def.armSeconds : 1;
  const spin = st.on ? SPIN_IDLE : SPIN_ARMING * arming * arming;
  st.puck.rotation += spin * Math.PI * 2 * dt;
  const drop = Math.min(1, age / DROP_SECONDS);
  st.puck.scale.set(DROP_SCALE + (1 - DROP_SCALE) * drop * (2 - drop));

  const rate = BLINK_FROM + (BLINK_TO - BLINK_FROM) * arming;
  st.light.tint = st.on ? def.holoColor : ARM_LIGHT;
  st.light.alpha = st.on || (age * rate) % 1 < 0.5 ? 1 : 0.15;

  const g = st.halo.clear();
  const calls = st.calls.clear();
  if (!st.on) {
    for (let i = 0; i < CHARGE_RINGS; i++) {
      const t = (arming * 3 + i / CHARGE_RINGS) % 1;
      const r = CHARGE_RADIUS - (CHARGE_RADIUS - def.bodyRadius) * t * t;
      g.circle(0, 0, r).stroke({
        width: 2.5,
        color: ARM_LIGHT,
        alpha: 0.7 * arming * Math.sin(t * Math.PI),
      });
    }
    return;
  }

  // Call out: wake every wanderer in range and send a ring out to show how far it reaches.
  st.pulseIn -= dt;
  if (st.pulseIn <= 0) {
    st.pulseIn = def.pulseSeconds;
    ctx.horde.noise(st.x, st.y, def.lureRadius);
    st.callAges.push(0);
  }
  for (let i = st.callAges.length - 1; i >= 0; i--) {
    const t = (st.callAges[i] += dt / CALL_SECONDS);
    if (t >= 1) {
      st.callAges.splice(i, 1);
      continue;
    }
    const ease = 1 - (1 - t) * (1 - t);
    calls
      .circle(0, 0, def.bodyRadius + (def.lureRadius - def.bodyRadius) * ease)
      .stroke({
        width: 3 + 5 * (1 - t),
        color: def.holoColor,
        alpha: 0.4 * (1 - t),
      });
  }
  const pulse = 0.5 + 0.5 * Math.sin(age * Math.PI * 2 * 2);
  const fade = flicker(age, left, def.flickerSeconds);
  g.circle(0, 0, GLOW_RADIUS)
    .fill({ color: def.holoColor, alpha: (0.15 + 0.1 * pulse) * fade })
    .circle(0, 0, LURE_RING + 4 * pulse)
    .stroke({
      width: 2.5,
      color: def.holoColor,
      alpha: (0.5 + 0.3 * pulse) * fade,
    });
  calls.alpha = fade;
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
  const onFor = def.seconds - left;
  const boot = Math.min(1, onFor / BOOT_SECONDS);
  const bob = HOLO_SCALE * (1 + BOB * Math.sin(onFor * BOB_HZ * Math.PI * 2));
  holo.scale.set(bob, bob * boot);

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
    (boot < 1 ? (Math.random() < 0.5 ? 0.3 : 1) : 1) *
    flicker(onFor, left, def.flickerSeconds);
  st.hum?.volume(
    HUM_VOLUME * (left < def.flickerSeconds ? left / def.flickerSeconds : 1),
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

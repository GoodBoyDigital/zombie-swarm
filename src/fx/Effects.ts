import { Container, Sprite, TilingSprite, type Texture } from "pixi.js";
import type { RayHit } from "../combat/raycast";
import type { ExplosionDef } from "../config/explosions";
import { pick, rand } from "../core/random";
import { BLAST_TEXTURE_RADIUS, type GameTextures } from "./textures";

type Kind = "flash" | "tracer" | "spark" | "puff" | "glow" | "boom" | "ring";

interface Particle {
  sprite: Sprite;
  kind: Kind;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  /** Flash only: the gun it's pinned to, and its small random tilt off the barrel. */
  source: MuzzleSource | null;
  tilt: number;
  /** Puffs only: alpha at birth, fading to nothing. */
  peak: number;
  /** Blast parts and puffs: scale at birth and at full size. Tracers: thickness at birth in size0. */
  size0: number;
  size1: number;
}

interface RailBeam {
  view: Container;
  glow: Sprite;
  halo: Sprite;
  energy: TilingSprite;
  core: Sprite;
  flares: Sprite[];
  age: number;
}

const RAIL_SECONDS = 0.25;

/** Anything with a barrel tip the muzzle flash should stay attached to while it fades. */
export interface MuzzleSource {
  readonly aim: number;
  muzzle(): { x: number; y: number };
}

/** Random tilt of each flash off the barrel line, radians. Kept small so it reads as coming out of the gun. */
const FLASH_TILT = 0.05;

/** Tracers draw a little wider than the weapon's tracerWidth; the soft edge eats the outer rows. */
const TRACER_WIDTH_SCALE = 1.6;
/** Power-mode tracer glow: an angry orange-red under a white core. */
const HOT_TRACER = 0xff5a1f;
/** How much thicker the whole power-mode tracer (glow and core) is drawn. */
const HOT_TRACER_THICKNESS = 3;
/** Magnet lightning: kinks per bolt, sideways wander in px, and how long one flickers. */
const ZAP_SEGMENTS = 5;
const ZAP_JITTER = 9;
const ZAP_SECONDS = 0.1;
export interface ZapOptions {
  /** Bolt thickness, px. The white core is a share of it. */
  width?: number;
  life?: number;
  /** Most sideways wander per kink, px. */
  jitter?: number;
  /** Lay a wide faint halo and a softer inner glow under the bolt. */
  glow?: boolean;
  /** Kink at least this often along the bolt, px, so long bolts stay jagged. Omitted = a fixed few kinks. */
  kinkEvery?: number;
}

/** Floor dust kicked up by a pressure wave: colour, peak alpha, size in px. */
const DUST_TINT = 0x9a9180;
const DUST_ALPHA = 0.3;
/** Torn flesh flung off a saw. */
const GORE_TINTS = [0x3f9a28, 0x2c6b1c, 0x6fe04a, 0x7a3a2a];

/** Wall chips and dust thrown off a bullet impact: chunk count, then colours. */
const WALL_DEBRIS = 9;
const WALL_CHUNK = 0x4a4540;
const WALL_DUST = 0xb8b0a2;

/** Fireball, chunks and embers thrown out by a blast. */
const DEBRIS_TINTS = [0xffd23a, 0xff7a1a, 0xff7a1a, 0x151a15];
/** Ice crystals and shards: white, ice-white and pale blue. */
const ICE_TINTS = [0xffffff, 0xdff6ff, 0xa8e2ff];
/** Frost blast flash and shockwave tints. */
const FROST_GLOW = 0x9fdcff;
const FROST_RING = 0xd8f4ff;

/** Short-lived visuals: muzzle flash, hitscan tracer, blood sparks, explosions. Sprites are pooled. */
export class Effects {
  readonly view = new Container({ sortableChildren: true });
  /** Fireballs, flashes, shockwaves and blast debris: add it to the world above the power-up layers. */
  readonly blastView = new Container();
  private readonly live: Particle[] = [];
  private readonly pool: Sprite[] = [];
  private readonly rails: RailBeam[] = [];
  private readonly railPool: RailBeam[] = [];

  constructor(readonly tex: GameTextures) {}

  /**
   * Flash at the gun's barrel tip. It follows the tip for its whole short life, because the gun
   * kicks back, the body recoils and the aim keeps turning in the frames after the shot.
   */
  muzzleFlash(source: MuzzleSource): void {
    const p = this.spawn("flash", this.tex.muzzleFlash, 0.07);
    p.source = source;
    p.tilt = rand(-FLASH_TILT, FLASH_TILT);
    p.sprite.anchor.set(0, 0.5);
    this.pinFlash(p);
    p.sprite.scale.set(
      rand(0.8, 1.15),
      rand(0.8, 1.2) * (Math.random() < 0.5 ? 1 : -1),
    );
    p.sprite.tint = 0xffffff;
    p.sprite.alpha = 1;
  }

  /** Visit every muzzle flash alive now, e.g. for the colour grade to keep them in colour. */
  forEachFlash(visit: (sprite: Sprite) => void): void {
    for (const p of this.live) if (p.kind === "flash") visit(p.sprite);
  }

  /**
   * Hitscan streak. `power` above 1 (power mode) makes it thicker, linger longer and run hot
   * orange with a white core laid over it.
   */
  tracer(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    power = 1,
  ): void {
    const hot = power > 1;
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const length = Math.hypot(x1 - x0, y1 - y0);
    const streak = (w: number, tint: number, life: number) => {
      const p = this.spawn("tracer", this.tex.tracer, life);
      p.sprite.anchor.set(0, 0.5);
      p.sprite.position.set(x0, y0);
      p.sprite.rotation = angle;
      p.sprite.width = length;
      p.sprite.height = p.size0 = w * TRACER_WIDTH_SCALE;
      p.sprite.tint = tint;
      p.sprite.alpha = 0.9;
    };
    if (!hot) {
      streak(width, 0xfff1c2, 0.09);
      return;
    }
    streak(width * power * 1.6 * HOT_TRACER_THICKNESS, HOT_TRACER, 0.14);
    streak(width * 0.9 * HOT_TRACER_THICKNESS, 0xffffff, 0.1);
  }

  /**
   * A quick jagged spark of lightning from (x0, y0) to (x1, y1): a coloured bolt with a white core.
   * `opts` thickens it, holds it longer, kinks it more or adds a halo.
   */
  zap(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    opts: ZapOptions = {},
  ): void {
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 1) return;
    const { width = 3, life = ZAP_SECONDS, glow = false } = opts;
    const nx = -(y1 - y0) / length;
    const ny = (x1 - x0) / length;
    const jitter = Math.min(opts.jitter ?? ZAP_JITTER, length * 0.15);
    const segments = opts.kinkEvery
      ? Math.max(ZAP_SEGMENTS, Math.ceil(length / opts.kinkEvery))
      : ZAP_SEGMENTS;
    // All additive, so a dimmed tint draws as a fainter glow: halo, inner glow, bolt, then a thin
    // white core that keeps it crisp.
    const layers: [number, number][] = [
      [width, color],
      [width * 0.4, 0xffffff],
    ];
    if (glow)
      layers.unshift(
        [width * 6, dim(color, 0.32)],
        [width * 2.6, dim(color, 0.6)],
      );
    let ax = x0;
    let ay = y0;
    for (let i = 1; i <= segments; i++) {
      const f = i / segments;
      const off = i < segments ? rand(-jitter, jitter) : 0;
      const bx = x0 + (x1 - x0) * f + nx * off;
      const by = y0 + (y1 - y0) * f + ny * off;
      const angle = Math.atan2(by - ay, bx - ax);
      const run = Math.hypot(bx - ax, by - ay);
      for (const [w, tint] of layers) {
        const p = this.spawn("tracer", this.tex.tracer, life);
        p.sprite.anchor.set(0, 0.5);
        p.sprite.position.set(ax, ay);
        p.sprite.rotation = angle;
        p.sprite.width = run;
        p.sprite.height = p.size0 = w * TRACER_WIDTH_SCALE;
        p.sprite.tint = tint;
        p.sprite.alpha = 0.9;
      }
      ax = bx;
      ay = by;
    }
  }

  /** One discharge along the fixed shot line, flaring and fading out. */
  railBeam(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    hits: readonly RayHit[],
  ): void {
    const beam = this.railPool.pop() ?? this.createRail();
    const length = Math.hypot(x1 - x0, y1 - y0);
    beam.age = 0;
    beam.view.position.set(x0, y0);
    beam.view.rotation = Math.atan2(y1 - y0, x1 - x0);
    for (const layer of [beam.glow, beam.halo, beam.energy, beam.core])
      layer.width = length;
    beam.energy.tilePosition.set(0, 0);
    // First flare is the muzzle burst. The rest stay at the original pierced points, not the moving bodies.
    const points = [{ x: x0, y: y0 }, ...hits];
    points.forEach((point, i) => {
      const flare =
        beam.flares[i] ??
        new Sprite({
          texture: this.tex.rail.burst,
          anchor: 0.5,
          blendMode: "add",
          label: i === 0 ? "railMuzzle" : "railImpact",
        });
      if (!beam.flares[i]) {
        beam.flares.push(flare);
        beam.view.addChild(flare);
      }
      flare.x = Math.hypot(point.x - x0, point.y - y0);
      flare.visible = true;
    });
    for (let i = points.length; i < beam.flares.length; i++)
      beam.flares[i].visible = false;
    this.view.addChild(beam.view);
    this.rails.push(beam);
    this.drawRail(beam);
  }

  private createRail(): RailBeam {
    const view = new Container({ label: "railBeam" });
    const glow = new Sprite({
      texture: this.tex.rail.glow,
      anchor: { x: 0, y: 0.5 },
      tint: 0x1467ff,
      blendMode: "add",
      label: "railGlow",
    });
    const halo = new Sprite({
      texture: this.tex.rail.glow,
      anchor: { x: 0, y: 0.5 },
      tint: 0x25caff,
      blendMode: "add",
      label: "railHalo",
    });
    const energy = new TilingSprite({
      texture: this.tex.rail.energy,
      width: 1,
      height: 32,
      anchor: { x: 0, y: 0.5 },
      tint: 0x70e9ff,
      blendMode: "add",
      label: "railEnergy",
    });
    const core = new Sprite({
      texture: this.tex.tracer,
      anchor: { x: 0, y: 0.5 },
      tint: 0xeaffff,
      blendMode: "add",
      label: "railCore",
    });
    view.addChild(glow, halo, energy, core);
    return { view, glow, halo, energy, core, flares: [], age: 0 };
  }

  private drawRail(beam: RailBeam): void {
    const strength = Math.max(0, 1 - beam.age / RAIL_SECONDS);
    const width = strength * strength;
    beam.view.visible = strength > 0;
    beam.glow.height = 7 + 113 * width;
    beam.glow.alpha = strength * 0.55;
    beam.halo.height = 3 + 51 * width;
    beam.halo.alpha = strength * 0.7;
    beam.energy.height = 4 + 72 * width;
    beam.energy.tileScale.y = beam.energy.height / this.tex.rail.energy.height;
    beam.energy.tilePosition.x = beam.age * 1000;
    beam.energy.alpha = strength;
    beam.core.height = 1 + 17 * width;
    beam.core.alpha = Math.min(1, strength * 2);
    beam.flares.forEach((flare, i) => {
      flare.scale.set((i === 0 ? 1.1 : 0.55) * (0.2 + width));
      flare.alpha = strength;
      flare.rotation = beam.age * (i % 2 === 0 ? 3 : -3);
    });
  }

  /** Blood spray leaving a hit point, biased along the shot direction. */
  /**
   * A bullet striking a wall: chips of wall and dust kicked back off the face, bouncing off the
   * surface rather than carrying on with the shot.
   */
  wallDebris(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    nx: number,
    ny: number,
  ): void {
    // Reflect the shot off the wall face, then spray around that.
    const dot = dirX * nx + dirY * ny;
    const rx = dirX - 2 * dot * nx;
    const ry = dirY - 2 * dot * ny;
    const out = Math.atan2(ry, rx);
    for (let i = 0; i < WALL_DEBRIS; i++) {
      const chunk = i % 3 !== 0;
      const p = this.spawn("spark", this.tex.spark, rand(0.2, 0.45));
      const a = out + rand(-1.1, 1.1);
      const speed = chunk ? rand(140, 360) : rand(60, 150);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = rand(0, Math.PI * 2);
      const s = chunk ? rand(0.9, 1.6) : rand(1.6, 2.6);
      p.sprite.scale.set(s, s * rand(0.7, 1));
      p.sprite.tint = chunk ? WALL_CHUNK : WALL_DUST;
      p.sprite.alpha = 1;
    }
  }

  bloodBurst(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    count: number,
    tint: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn("spark", this.tex.spark, rand(0.18, 0.4));
      // Tight cone along the shot so the spray clearly carries the bullet's momentum.
      const a = Math.atan2(dirY, dirX) + rand(-0.45, 0.45);
      const speed = rand(220, 560);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = a;
      p.sprite.scale.set(rand(1.6, 3), rand(0.5, 1.1));
      p.sprite.tint = tint;
      p.sprite.alpha = 1;
    }
  }

  /** A soft additive glow that swells and fades at a point, e.g. where lightning strikes. */
  bloom(
    x: number,
    y: number,
    radius: number,
    color: number,
    life: number,
  ): void {
    const p = this.spawn("glow", this.tex.blast.glow, life);
    p.sprite.blendMode = "add";
    p.sprite.anchor.set(0.5);
    p.sprite.position.set(x, y);
    p.sprite.tint = color;
    p.size1 = radius / BLAST_TEXTURE_RADIUS;
    p.size0 = p.size1 * 0.6;
    p.sprite.scale.set(p.size0);
    p.sprite.alpha = 1;
  }

  /** Soft puffs of floor dust drifting off along a direction, e.g. kicked up by a pressure wave. */
  dust(x: number, y: number, dirX: number, dirY: number, count: number): void {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const a = base + rand(-0.8, 0.8);
      const speed = rand(40, 160);
      const r = rand(3, 6);
      this.drift(
        this.tex.blast.glow,
        x + rand(-6, 6),
        y + rand(-6, 6),
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        r,
        r * rand(2, 3),
        DUST_TINT,
        DUST_ALPHA,
        rand(0.35, 0.7),
      );
    }
  }

  /**
   * One round smoke puff: drifts from (x, y) at (vx, vy) px/s with drag, grows from radius r0 to
   * r1 px and fades out from `alpha` over `life` seconds. Stays where it was puffed.
   */
  puff(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r0: number,
    r1: number,
    tint: number,
    alpha: number,
    life: number,
  ): void {
    this.drift(this.tex.smoke, x, y, vx, vy, r0, r1, tint, alpha, life);
  }

  /** A puff in any round texture of radius BLAST_TEXTURE_RADIUS: smoke, or the softer dust glow. */
  private drift(
    texture: Texture,
    x: number,
    y: number,
    vx: number,
    vy: number,
    r0: number,
    r1: number,
    tint: number,
    alpha: number,
    life: number,
  ): void {
    const p = this.spawn("puff", texture, life);
    p.vx = vx;
    p.vy = vy;
    p.sprite.anchor.set(0.5);
    p.sprite.position.set(x, y);
    p.sprite.rotation = rand(0, Math.PI * 2);
    p.size0 = r0 / BLAST_TEXTURE_RADIUS;
    p.size1 = r1 / BLAST_TEXTURE_RADIUS;
    p.sprite.scale.set(p.size0);
    p.sprite.tint = tint;
    p.sprite.alpha = p.peak = alpha;
  }

  /** Lumps of torn zombie thrown off in a wide fan along a direction, e.g. off a chainsaw. */
  gore(x: number, y: number, dirX: number, dirY: number, count: number): void {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const p = this.spawn("spark", this.tex.spark, rand(0.3, 0.55));
      const a = base + rand(-0.8, 0.8);
      const speed = rand(160, 420);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = rand(0, Math.PI * 2);
      const s = rand(1.6, 3);
      p.sprite.scale.set(s, s * rand(0.7, 1.1));
      p.sprite.tint = pick(GORE_TINTS);
      p.sprite.alpha = 1;
    }
  }

  /** A ring of glints leaving a pickup point. */
  sparkle(x: number, y: number, tint: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn("spark", this.tex.spark, rand(0.15, 0.3));
      p.sprite.blendMode = "add";
      const a = rand(0, Math.PI * 2);
      const speed = rand(90, 220);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = a;
      p.sprite.scale.set(rand(0.8, 1.4), rand(0.5, 0.8));
      p.sprite.tint = tint;
      p.sprite.alpha = 1;
    }
  }

  /**
   * The look of one blast: a white flash, a vector fireball that pops out and fades, a shockwave
   * ring running out to the edge of the radius, and debris. Damage and the floor scorch are explode's.
   */
  explosion(x: number, y: number, def: ExplosionDef): void {
    const R = BLAST_TEXTURE_RADIUS;
    const radius = def.visualRadius ?? def.radius;
    const size = (radius * def.flash) / R;
    const glow = this.blastPart(
      "glow",
      this.tex.blast.glow,
      def.seconds * 0.45,
      x,
      y,
    );
    glow.sprite.blendMode = "add";
    glow.size0 = size * 2.4;
    glow.size1 = size * 1.4;
    const boom = this.blastPart(
      "boom",
      this.tex.blast.boom,
      def.seconds * 0.6,
      x,
      y,
    );
    boom.size0 = size * 0.35;
    boom.size1 = size;
    if (def.ring > 0) {
      const ring = this.blastPart(
        "ring",
        this.tex.blast.ring,
        def.seconds,
        x,
        y,
      );
      ring.size0 = (radius * 0.1) / R;
      ring.size1 = (radius * def.ring) / R;
    }
    for (let i = 0; i < def.debris; i++) {
      const p = this.spawn(
        "spark",
        this.tex.spark,
        rand(0.3, 0.7),
        this.blastView,
      );
      const a = rand(0, Math.PI * 2);
      const speed = rand(1.5, 4) * radius;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = a;
      const chunk = rand(1.5, 3.5);
      p.sprite.scale.set(chunk * rand(1, 1.8), chunk * rand(0.6, 1));
      p.sprite.tint = pick(DEBRIS_TINTS);
      p.sprite.alpha = 1;
    }
  }

  /**
   * The look of an icy blast: a white-blue flash, a frost ring running out to `radius` and ice
   * crystals flung out across it.
   */
  frostBlast(
    x: number,
    y: number,
    radius: number,
    seconds: number,
    crystals: number,
  ): void {
    const R = BLAST_TEXTURE_RADIUS;
    const size = (radius * 0.5) / R;
    const glow = this.blastPart(
      "glow",
      this.tex.blast.glow,
      seconds * 0.5,
      x,
      y,
    );
    glow.sprite.blendMode = "add";
    glow.sprite.tint = FROST_GLOW;
    glow.size0 = size * 2.8;
    glow.size1 = size * 1.6;
    const ring = this.blastPart("ring", this.tex.blast.ring, seconds, x, y);
    ring.sprite.tint = FROST_RING;
    ring.size0 = (radius * 0.1) / R;
    ring.size1 = radius / R;
    // Sparks coast to about speed / 6 under their drag, so the fastest reach the edge.
    for (let i = 0; i < crystals; i++)
      this.shard(x, y, rand(0, Math.PI * 2), rand(1.5, 6) * radius, 1.2, true);
  }

  /** Ice breaking: shards flung all round, half of them carried along (dirX, dirY), and a few glints. */
  iceShards(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    count: number,
  ): void {
    const along = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const a = i % 2 === 0 ? rand(0, Math.PI * 2) : along + rand(-0.8, 0.8);
      this.shard(x, y, a, rand(150, 480), 1.1, false);
    }
    this.sparkle(x, y, 0xe6f8ff, Math.ceil(count / 4));
  }

  private shard(
    x: number,
    y: number,
    angle: number,
    speed: number,
    size: number,
    overBlasts: boolean,
  ): void {
    const p = this.spawn(
      "spark",
      this.tex.ice.shard,
      rand(0.3, 0.75),
      overBlasts ? this.blastView : this.view,
    );
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.sprite.anchor.set(0.5);
    p.sprite.position.set(x, y);
    p.sprite.rotation = angle;
    const s = rand(0.7, 1.4) * size;
    p.sprite.scale.set(s * rand(1, 1.6), s);
    p.sprite.tint = pick(ICE_TINTS);
    p.sprite.alpha = 1;
  }

  update(dt: number): void {
    for (let i = this.rails.length - 1; i >= 0; i--) {
      const beam = this.rails[i];
      beam.age += dt;
      if (beam.age >= RAIL_SECONDS) {
        beam.view.removeFromParent();
        this.rails.splice(i, 1);
        this.railPool.push(beam);
        continue;
      }
      this.drawRail(beam);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.recycle(i);
        continue;
      }
      const t = p.life / p.maxLife;
      switch (p.kind) {
        case "flash":
          this.pinFlash(p);
          p.sprite.alpha = t;
          p.sprite.scale.x = 0.4 + t * 0.8;
          break;
        case "tracer":
          p.sprite.alpha = t * 0.9;
          // From its life left, not a per-frame shrink, so it thins the same at any frame rate.
          p.sprite.height = Math.max(0.5, p.size0 * (0.3 + 0.7 * t));
          break;
        case "spark":
          p.sprite.x += p.vx * dt;
          p.sprite.y += p.vy * dt;
          p.vx *= Math.exp(-dt * 6);
          p.vy *= Math.exp(-dt * 6);
          p.sprite.alpha = Math.min(1, t * 2);
          break;
        case "puff":
          p.sprite.x += p.vx * dt;
          p.sprite.y += p.vy * dt;
          p.vx *= Math.exp(-dt * 4);
          p.vy *= Math.exp(-dt * 4);
          p.sprite.scale.set(p.size1 + (p.size0 - p.size1) * t);
          p.sprite.alpha = p.peak * t;
          break;
        case "glow":
          p.sprite.scale.set(p.size1 + (p.size0 - p.size1) * t);
          p.sprite.alpha = t * t;
          break;
        case "boom": {
          // Flat vector: pops to full size in the first quarter of its life, holds, then
          // collapses solid instead of fading, with only the last sliver going transparent.
          const u = 1 - t;
          const grow = 1 - (1 - Math.min(1, u * 4)) ** 2;
          const shrink = t < 0.45 ? t / 0.45 : 1;
          p.sprite.scale.set(
            (p.size0 + (p.size1 - p.size0) * grow) * (0.15 + 0.85 * shrink),
          );
          p.sprite.alpha = Math.min(1, t * 6);
          break;
        }
        case "ring": {
          const u = 1 - t;
          p.sprite.scale.set(
            p.size0 + (p.size1 - p.size0) * (1 - (1 - u) ** 3),
          );
          p.sprite.alpha = t * 0.9;
          break;
        }
      }
    }
  }

  private spawn(
    kind: Kind,
    texture: Texture,
    life: number,
    layer = this.view,
  ): Particle {
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = texture;
    sprite.label = kind;
    // Keep muzzle flashes over shot lines, including when a pooled sprite changes kind.
    sprite.zIndex = kind === "flash" ? 1 : 0;
    // The flash is an outlined vector star, so it draws normally; only the tracer glows additively.
    sprite.blendMode = kind === "tracer" ? "add" : "normal";
    sprite.visible = true;
    layer.addChild(sprite);
    const p: Particle = {
      sprite,
      kind,
      life,
      maxLife: life,
      vx: 0,
      vy: 0,
      source: null,
      tilt: 0,
      peak: 1,
      size0: 1,
      size1: 1,
    };
    this.live.push(p);
    return p;
  }

  private blastPart(
    kind: Kind,
    texture: Texture,
    life: number,
    x: number,
    y: number,
  ): Particle {
    const p = this.spawn(kind, texture, life, this.blastView);
    p.sprite.anchor.set(0.5);
    p.sprite.position.set(x, y);
    p.sprite.rotation = rand(0, Math.PI * 2);
    p.sprite.tint = 0xffffff;
    p.sprite.alpha = 1;
    p.sprite.scale.set(0);
    return p;
  }

  private pinFlash(p: Particle): void {
    if (!p.source) return;
    const m = p.source.muzzle();
    p.sprite.position.set(m.x, m.y);
    p.sprite.rotation = p.source.aim + p.tilt;
  }

  private recycle(index: number): void {
    const p = this.live[index];
    p.sprite.removeFromParent();
    this.pool.push(p.sprite);
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
  }
}

/** A colour scaled toward black, channel by channel. */
function dim(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

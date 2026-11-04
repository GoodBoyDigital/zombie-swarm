import {
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  TilingSprite,
  type Renderer,
  type Texture,
} from "pixi.js";
import { ARENA } from "../config/arena";
import { profiler } from "../debug/Profiler";
import { BLAST_TEXTURE_RADIUS, type GameTextures } from "../fx/textures";

const OUTSIDE_COLOR = 0x000000;
/** Bullet chips knocked out of the walls: a dark hole with a pale broken rim. */
const CHIP_HOLE = 0x0d0c0b;
const CHIP_RIM = 0x6e675e;
const CHIP_VARIANTS = 4;
const CHIP_RADIUS = 4;
/** How far into the wall a chip is centred, px: the middle of the wall, so it never pokes onto the floor. */
const CHIP_DEPTH = ARENA.wallThickness / 2;
/** Grit stamped on the floor at the foot of the wall per hit. */
const RUBBLE_BITS = 3;
const RUBBLE_TINT = 0x57524b;
const SCORCH_TINT = 0x1c1a16;
const SCORCH_ALPHA = 0.45;

interface StampOptions {
  rotation?: number;
  scale?: number;
  /** Per-axis scale for streaks; falls back to `scale`. */
  scaleX?: number;
  scaleY?: number;
  tint?: number;
  alpha?: number;
}

/**
 * Persistent floor. Splats and corpses are rendered once into a render texture and then forgotten,
 * so the ground can accumulate unlimited gore without adding display objects.
 */
export class FloorCanvas {
  readonly view: Sprite;
  /** Damage on the walls (bullet chips), drawn over the wall art; add it to the world above the arena. */
  readonly wallView: Sprite;
  private readonly target: RenderTexture;
  private readonly wallTarget: RenderTexture;
  private readonly chips: Texture[] = [];
  private readonly stamp = new Sprite();
  /** World-space offset of the texture's top-left corner. */
  private readonly origin = -ARENA.margin;

  constructor(
    private readonly renderer: Renderer,
    private readonly tex: GameTextures,
  ) {
    const size = {
      width: ARENA.width + ARENA.margin * 2,
      height: ARENA.height + ARENA.margin * 2,
    };
    this.target = RenderTexture.create({
      ...size,
      resolution: renderer.resolution,
    });
    this.view = new Sprite(this.target);
    this.view.position.set(this.origin, this.origin);
    this.wallTarget = RenderTexture.create({
      ...size,
      resolution: renderer.resolution,
    });
    this.wallView = new Sprite(this.wallTarget);
    this.wallView.position.set(this.origin, this.origin);
    this.stamp.anchor.set(0.5);
    this.paintBase(size.width, size.height, tex);
    for (let i = 0; i < CHIP_VARIANTS; i++) this.chips.push(this.makeChip());
  }

  /**
   * A bullet hit the wall at (x, y), whose inward normal is (nx, ny): knock a chip out of the wall
   * face and leave a little grit on the floor below it. Both persist.
   */
  chipWall(x: number, y: number, nx: number, ny: number): void {
    const chip = this.chips[Math.floor(Math.random() * this.chips.length)];
    this.stampTo(
      this.wallTarget,
      chip,
      x - nx * CHIP_DEPTH,
      y - ny * CHIP_DEPTH,
      {
        rotation: Math.random() * Math.PI * 2,
        scale: 0.9 + Math.random() * 0.5,
      },
    );
    for (let i = 0; i < RUBBLE_BITS; i++) {
      const out = 4 + Math.random() * 14;
      const along = (Math.random() - 0.5) * 16;
      this.stampTexture(
        this.tex.spark,
        x + nx * out - ny * along,
        y + ny * out + nx * along,
        {
          rotation: Math.random() * Math.PI * 2,
          scale: 0.3 + Math.random() * 0.3,
          tint: RUBBLE_TINT,
        },
      );
    }
  }

  /** One jagged chip: a dark hole inside a lighter broken rim. */
  private makeChip(): Texture {
    const points = (r: number) => {
      const out: number[] = [];
      const n = 7 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const d = r * (0.6 + Math.random() * 0.5);
        out.push(Math.cos(a) * d, Math.sin(a) * d);
      }
      return out;
    };
    const g = new Graphics()
      .poly(points(CHIP_RADIUS))
      .fill(CHIP_RIM)
      .poly(points(CHIP_RADIUS * 0.65))
      .fill(CHIP_HOLE);
    const texture = this.renderer.generateTexture({
      target: g,
      antialias: true,
      resolution: this.renderer.resolution,
    });
    g.destroy();
    return texture;
  }

  /** Free the render texture. The view is destroyed with the world. */
  destroy(): void {
    this.target.destroy(true);
    this.wallTarget.destroy(true);
    for (const chip of this.chips) chip.destroy(true);
  }

  /** Burn a texture into the floor at a world position. */
  stampTexture(
    texture: Texture,
    x: number,
    y: number,
    opts: StampOptions = {},
  ): void {
    this.stampTo(this.target, texture, x, y, opts);
  }

  private stampTo(
    target: RenderTexture,
    texture: Texture,
    x: number,
    y: number,
    opts: StampOptions = {},
  ): void {
    this.stamp.texture = texture;
    this.stamp.position.set(x - this.origin, y - this.origin);
    this.stamp.rotation = opts.rotation ?? 0;
    const s = opts.scale ?? 1;
    this.stamp.scale.set(opts.scaleX ?? s, opts.scaleY ?? s);
    this.stamp.tint = opts.tint ?? 0xffffff;
    this.stamp.alpha = opts.alpha ?? 1;
    const t0 = performance.now();
    this.renderer.render({ container: this.stamp, target, clear: false });
    // Stamps run inside horde, corpse and casing updates, so this time is also inside theirs.
    profiler.add("floor", performance.now() - t0);
  }

  /** Burn a dark blast mark of roughly `radius` world px into the floor. */
  scorch(x: number, y: number, radius: number): void {
    this.stampTexture(this.tex.blast.scorch, x, y, {
      rotation: Math.random() * Math.PI * 2,
      scale: radius / BLAST_TEXTURE_RADIUS,
      tint: SCORCH_TINT,
      alpha: SCORCH_ALPHA,
    });
  }

  /** A faint blue burn, clipped at the wall so the black beyond the arena stays black. */
  railScorch(x0: number, y0: number, x1: number, y1: number): void {
    if (x0 < 0 || y0 < 0 || x0 > ARENA.width || y0 > ARENA.height) return;
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length === 0) return;
    const dx = (x1 - x0) / length;
    const dy = (y1 - y0) / length;
    const wallX =
      dx > 0 ? (ARENA.width - x0) / dx : dx < 0 ? -x0 / dx : Infinity;
    const wallY =
      dy > 0 ? (ARENA.height - y0) / dy : dy < 0 ? -y0 / dy : Infinity;
    const run = Math.min(length, wallX, wallY);
    this.stampTexture(
      this.tex.rail.scorch,
      x0 + (dx * run) / 2,
      y0 + (dy * run) / 2,
      {
        rotation: Math.atan2(dy, dx),
        scaleX: run / this.tex.rail.scorch.width,
        scaleY: 1.2,
        tint: 0x3689ca,
        alpha: 0.28,
      },
    );
  }

  /** Dirt everywhere, concrete inside the walls. Tiled once into the render texture. */
  private paintBase(width: number, height: number, tex: GameTextures): void {
    const m = ARENA.margin;
    const base = new Container();
    // Pure black beyond the walls: the outside world is darkness zombies walk in from.
    base.addChild(new Graphics().rect(0, 0, width, height).fill(OUTSIDE_COLOR));
    const concrete = new TilingSprite({
      texture: tex.tiles.concrete,
      width: ARENA.width,
      height: ARENA.height,
    });
    concrete.position.set(m, m);
    // Larger repeat hides the tile seam; the tint keeps the floor from competing with the characters.
    concrete.tileScale.set(1.5);
    concrete.tint = 0xb4b4ae;
    base.addChild(concrete);
    this.renderer.render({ container: base, target: this.target, clear: true });
    base.destroy({ children: true });
  }
}

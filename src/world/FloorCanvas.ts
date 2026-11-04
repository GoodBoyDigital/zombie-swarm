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
const SCORCH_TINT = 0x1c1a16;
const SCORCH_ALPHA = 0.45;

/**
 * Persistent floor. Splats and corpses are rendered once into a render texture and then forgotten,
 * so the ground can accumulate unlimited gore without adding display objects.
 */
export class FloorCanvas {
  readonly view: Sprite;
  private readonly target: RenderTexture;
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
    this.stamp.anchor.set(0.5);
    this.paintBase(size.width, size.height, tex);
  }

  /** Free the render texture. The view is destroyed with the world. */
  destroy(): void {
    this.target.destroy(true);
  }

  /** Burn a texture into the floor at a world position. */
  stampTexture(
    texture: Texture,
    x: number,
    y: number,
    opts: {
      rotation?: number;
      scale?: number;
      /** Per-axis scale for streaks; falls back to `scale`. */
      scaleX?: number;
      scaleY?: number;
      tint?: number;
      alpha?: number;
    } = {},
  ): void {
    this.stamp.texture = texture;
    this.stamp.position.set(x - this.origin, y - this.origin);
    this.stamp.rotation = opts.rotation ?? 0;
    const s = opts.scale ?? 1;
    this.stamp.scale.set(opts.scaleX ?? s, opts.scaleY ?? s);
    this.stamp.tint = opts.tint ?? 0xffffff;
    this.stamp.alpha = opts.alpha ?? 1;
    const t0 = performance.now();
    this.renderer.render({
      container: this.stamp,
      target: this.target,
      clear: false,
    });
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

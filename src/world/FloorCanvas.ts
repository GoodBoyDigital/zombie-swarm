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
import type { GameTextures } from "../fx/textures";

const OUTSIDE_COLOR = 0x000000;

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
    tex: GameTextures,
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

import {
  Container,
  Matrix,
  Rectangle,
  RenderTexture,
  Sprite,
  type Renderer,
} from "pixi.js";
import { MAX_ZOMBIE_RADIUS } from "../config/zombies";
import type { Horde } from "../entities/Horde";
import type { Player } from "../entities/Player";
import type { SpareMask } from "./ColorGrade";
import type { Effects } from "./Effects";

/**
 * Mask texels per screen CSS px. Low: orbs are big soft shapes, and the player's edge is a dark ink
 * outline that reads the same graded or not, so the soft mask edge doesn't show.
 */
const RESOLUTION = 0.5;
/** World px around the player where zombies over him are cut back out of the mask. */
const REACH = 90;

/**
 * What keeps its colour while the colour grade spares it: the player, the power-up visuals on the
 * ground under him, power-up orbs and muzzle flashes. One screen-sized, low-resolution texture,
 * drawn only on frames the grade needs it. Zombies drawn over the player are erased from it so a
 * crowd piling onto him is graded like the rest; orbs and flashes draw over the horde anyway.
 */
export class ColorMask implements SpareMask {
  readonly texture: RenderTexture;
  readonly frame: Rectangle;
  /** Erasers in the shape of the zombies over the player. */
  private readonly cutouts = new Container();
  private readonly cutoutPool: Sprite[] = [];
  /** Copies of the live muzzle flashes, which are spread among other effects in their own layer. */
  private readonly flashes = new Container();
  private readonly flashPool: Sprite[] = [];
  private readonly playerTransform = new Matrix();

  constructor(
    private readonly renderer: Renderer,
    screen: Rectangle,
  ) {
    this.frame = screen;
    this.texture = RenderTexture.create({
      width: screen.width,
      height: screen.height,
      resolution: RESOLUTION,
    });
  }

  render(
    world: Container,
    player: Player,
    ground: Container,
    horde: Horde,
    drops: Container,
    fx: Effects,
  ): void {
    const { width, height } = this.frame;
    if (this.texture.width !== width || this.texture.height !== height)
      this.texture.resize(width, height);
    // The world sits straight on the stage, so its local transform is world to screen.
    world.updateLocalTransform();
    const m = world.localTransform;
    const target = this.texture;
    const draw = (container: Container, clear = false, transform = m) =>
      this.renderer.render({ container, target, clear, transform });

    draw(
      player.view,
      true,
      this.playerTransform
        .identity()
        .rotate(player.aim)
        .translate(player.x, player.y)
        .prepend(m),
    );
    if (ground.children.length > 0) draw(ground);
    let used = 0;
    // Sprites reach past the body circle (arms out), so look a little wider than it.
    const reach = REACH + MAX_ZOMBIE_RADIUS * 2;
    horde.hash.queryBox(
      player.x - reach,
      player.y - reach,
      player.x + reach,
      player.y + reach,
      (z) => {
        if (z.dead || !z.sprite.visible) return;
        copy(
          z.sprite,
          this.pooled(this.cutouts, this.cutoutPool, used++, "erase"),
        );
      },
    );
    if (hideFrom(this.cutoutPool, used) > 0) draw(this.cutouts);
    if (drops.children.length > 0) draw(drops);
    used = 0;
    fx.forEachFlash((s) =>
      copy(s, this.pooled(this.flashes, this.flashPool, used++, "normal")),
    );
    if (hideFrom(this.flashPool, used) > 0) draw(this.flashes);
  }

  destroy(): void {
    this.texture.destroy(true);
    this.cutouts.destroy({ children: true });
    this.flashes.destroy({ children: true });
  }

  private pooled(
    layer: Container,
    pool: Sprite[],
    index: number,
    blendMode: "erase" | "normal",
  ): Sprite {
    if (pool[index]) return pool[index];
    const s = new Sprite({ blendMode });
    layer.addChild(s);
    pool.push(s);
    return s;
  }
}

/** Mirror a world-space sprite onto a mask copy. */
function copy(src: Sprite, s: Sprite): void {
  s.visible = true;
  s.texture = src.texture;
  s.anchor.copyFrom(src.anchor);
  s.position.copyFrom(src.position);
  s.scale.copyFrom(src.scale);
  s.rotation = src.rotation;
  s.alpha = src.alpha;
}

/** Hide the unused tail of a pool; returns how many are in use. */
function hideFrom(pool: Sprite[], used: number): number {
  for (let i = used; i < pool.length; i++) pool[i].visible = false;
  return used;
}

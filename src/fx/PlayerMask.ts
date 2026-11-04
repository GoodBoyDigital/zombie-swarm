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

/** World px either side of the player the mask covers: his ground auras and speed trail fit inside. */
const REACH = 90;

/**
 * Where the player shows on screen, for the colour grade to spare: his sprite and the power-up
 * visuals on the ground under him, with any zombie drawn over him cut back out so a crowd piling
 * onto him is graded like the rest. Rendered into a small screen-space box around him each frame
 * it is needed, a handful of sprites, so it stays cheap however big the horde is.
 */
export class PlayerMask implements SpareMask {
  readonly texture: RenderTexture;
  readonly frame = new Rectangle();
  /** Erasers in the shape of the zombies over the player. */
  private readonly cutouts = new Container();
  private readonly pool: Sprite[] = [];
  private readonly toScreen = new Matrix();
  private readonly local = new Matrix();

  constructor(private readonly renderer: Renderer) {
    this.texture = RenderTexture.create({
      width: 1,
      height: 1,
      resolution: renderer.resolution,
    });
  }

  render(
    world: Container,
    player: Player,
    ground: Container,
    horde: Horde,
  ): void {
    // The world sits straight on the stage, so its local transform is world to screen.
    world.updateLocalTransform();
    const wt = world.localTransform;
    const half = REACH * Math.hypot(wt.a, wt.b);
    const size = Math.ceil(half * 2);
    const sx = wt.a * player.x + wt.c * player.y + wt.tx;
    const sy = wt.b * player.x + wt.d * player.y + wt.ty;
    this.frame.set(sx - half, sy - half, size, size);
    if (this.texture.width !== size) this.texture.resize(size, size);

    const m = this.toScreen.copyFrom(wt);
    m.tx -= this.frame.x;
    m.ty -= this.frame.y;
    const target = this.texture;
    this.renderer.render({
      container: ground,
      target,
      clear: true,
      transform: m,
    });
    const p = this.local
      .identity()
      .rotate(player.aim)
      .translate(player.x, player.y)
      .prepend(m);
    this.renderer.render({
      container: player.view,
      target,
      clear: false,
      transform: p,
    });

    let used = 0;
    // Sprites reach past the body circle (arms out), so look a little wider than it.
    const reach = REACH + MAX_ZOMBIE_RADIUS * 2;
    horde.hash.queryBox(
      player.x - reach,
      player.y - reach,
      player.x + reach,
      player.y + reach,
      (z) => {
        const src = z.sprite;
        if (z.dead || !src.visible) return;
        const s = this.pool[used] ?? this.cutout();
        used++;
        s.visible = true;
        s.texture = src.texture;
        s.anchor.copyFrom(src.anchor);
        s.position.copyFrom(src.position);
        s.scale.copyFrom(src.scale);
        s.rotation = src.rotation;
      },
    );
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
    if (used > 0)
      this.renderer.render({
        container: this.cutouts,
        target,
        clear: false,
        transform: m,
      });
  }

  destroy(): void {
    this.texture.destroy(true);
    this.cutouts.destroy({ children: true });
  }

  private cutout(): Sprite {
    const s = new Sprite({ blendMode: "erase" });
    this.cutouts.addChild(s);
    this.pool.push(s);
    return s;
  }
}

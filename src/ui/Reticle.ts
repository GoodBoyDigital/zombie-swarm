import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Weapon } from "../combat/Weapon";
import type { Input } from "../core/Input";
import type { GameTextures } from "../fx/textures";

/** Crosshair width on screen in px. The ring and timer scale with it. */
export const RETICLE_SIZE = 72;
const RING_RADIUS = RETICLE_SIZE * 0.65;
const RING_WIDTH = RETICLE_SIZE * 0.1;
const TIMER_FONT = RETICLE_SIZE * 0.33;
const RING_BACK = 0x000000;
const RING_FILL = 0xffd84a;
const RING_DONE = 0xffffff;
/** The ring snaps bright and shrinks back when a reload lands. */
const FLASH_SECONDS = 0.18;
const FLASH_SCALE = 1.35;

/**
 * Crosshair under the pointer in screen space, so camera shake never moves it. While the weapon
 * reloads a ring fills clockwise around it with the seconds left underneath.
 */
export class Reticle {
  readonly view = new Container();
  private readonly ring = new Graphics();
  private readonly reloadUi = new Container();
  private readonly timer: Text;
  private wasReloading = false;
  private flash = 0;

  constructor(
    tex: GameTextures,
    private readonly input: Input,
  ) {
    const cross = new Sprite(tex.crosshair);
    cross.anchor.set(0.5);
    cross.scale.set(RETICLE_SIZE / tex.crosshair.width);
    this.timer = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: TIMER_FONT,
        fontWeight: "bold",
        fill: RING_FILL,
        stroke: { color: 0x000000, width: TIMER_FONT * 0.22 },
      },
    });
    this.timer.anchor.set(0.5, 0);
    this.timer.y = RING_RADIUS + RING_WIDTH;
    this.reloadUi.addChild(this.ring, this.timer);
    this.reloadUi.visible = false;
    this.view.addChild(this.reloadUi, cross);
    this.view.eventMode = "none";

    const hide = () => (this.view.visible = false);
    const show = () => (this.view.visible = true);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("mouseenter", show);
    window.addEventListener("blur", hide);
  }

  update(dt: number, weapon: Weapon): void {
    this.view.position.set(this.input.pointer.x, this.input.pointer.y);
    const reloading = weapon.reloading;
    if (this.wasReloading && !reloading) this.flash = FLASH_SECONDS;
    this.wasReloading = reloading;
    this.flash = Math.max(0, this.flash - dt);

    const flashing = this.flash > 0;
    this.reloadUi.visible = reloading || flashing;
    if (!this.reloadUi.visible) {
      this.reloadUi.scale.set(1);
      return;
    }
    const t = flashing ? this.flash / FLASH_SECONDS : 0;
    const progress = reloading
      ? 1 - weapon.reloadLeft / weapon.def.reloadSeconds
      : 1;
    this.reloadUi.scale.set(1 + (FLASH_SCALE - 1) * t);
    this.timer.text = reloading ? `${weapon.reloadLeft.toFixed(1)}s` : "";
    this.drawRing(progress, flashing ? RING_DONE : RING_FILL);
  }

  /** Full dark ring underneath, the filled share on top, starting at 12 o'clock and going clockwise. */
  private drawRing(progress: number, color: number): void {
    const start = -Math.PI / 2;
    this.ring
      .clear()
      .circle(0, 0, RING_RADIUS)
      .stroke({ width: RING_WIDTH + 2, color: RING_BACK, alpha: 0.7 });
    if (progress <= 0) return;
    // arc() joins from the pen's current point, so move it onto the ring first or a spoke is drawn from the centre.
    this.ring
      .moveTo(RING_RADIUS * Math.cos(start), RING_RADIUS * Math.sin(start))
      .arc(0, 0, RING_RADIUS, start, start + Math.PI * 2 * progress)
      .stroke({ width: RING_WIDTH, color });
  }
}

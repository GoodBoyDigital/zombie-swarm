import { Container, Graphics } from "pixi.js";
import type { Weapon } from "../combat/Weapon";
import type { Input } from "../core/Input";

/** Crosshair width on screen in px. The reload ring scales with it. */
export const RETICLE_SIZE = 72;
const CROSS_COLOR = 0xff2a2a;
const CROSS_OUTLINE = 0x140808;
const CROSS_RADIUS = RETICLE_SIZE * 0.26;
const CROSS_LINE = RETICLE_SIZE * 0.045;
/** Ticks run from just inside the circle to well outside it, leaving the centre open. */
const TICK_INNER = CROSS_RADIUS * 0.55;
const TICK_OUTER = RETICLE_SIZE * 0.5;
const DOT_RADIUS = RETICLE_SIZE * 0.035;
const RING_RADIUS = RETICLE_SIZE * 0.65;
const RING_WIDTH = RETICLE_SIZE * 0.1;
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
  private wasReloading = false;
  private flash = 0;

  constructor(private readonly input: Input) {
    const cross = drawCrosshair();
    this.reloadUi.addChild(this.ring);
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

/**
 * Vector crosshair: drawn once, antialiased at device resolution, so it stays smooth at any size.
 * A dark underlay a little wider than each red stroke keeps it readable over the horde and the floor.
 */
function drawCrosshair(): Graphics {
  const g = new Graphics();
  const shape = (width: number, color: number) => {
    g.circle(0, 0, CROSS_RADIUS).stroke({ width, color, cap: "round" });
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      g.moveTo(x * TICK_INNER, y * TICK_INNER)
        .lineTo(x * TICK_OUTER, y * TICK_OUTER)
        .stroke({ width, color, cap: "round" });
    }
  };
  shape(CROSS_LINE + 3, CROSS_OUTLINE);
  shape(CROSS_LINE, CROSS_COLOR);
  g.circle(0, 0, DOT_RADIUS + 1.5).fill(CROSS_OUTLINE);
  g.circle(0, 0, DOT_RADIUS).fill(CROSS_COLOR);
  return g;
}

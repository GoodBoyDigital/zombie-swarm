import { Graphics } from "pixi.js";

const WIDTH = 200;
const HEIGHT = 18;
const RADIUS = 9;
const OUTLINE = 3;
const BACK = 0x2a1f1a;
const EDGE = 0x14100d;
const FILL = 0xe0422f;
const FILL_LOW = 0xff8c2b;
/** Lighter band across the top of the fill, the one cel-shade tone the vector style allows. */
const SHINE = 0xff8a7a;
const LOW_FRACTION = 0.3;
/** Health is drawn to the nearest step so the bar doesn't crawl by sub-pixels. */
const STEPS = 50;

/** Top-left health bar in screen space: a rounded flat-vector pill with a bold outline. */
export class HealthBar {
  readonly view = new Graphics();
  private shown = -1;

  update(health: number, max: number): void {
    const steps = Math.ceil((STEPS * Math.max(0, health)) / max);
    if (steps === this.shown) return;
    this.shown = steps;
    const g = this.view.clear();
    g.roundRect(0, 0, WIDTH, HEIGHT, RADIUS)
      .fill(BACK)
      .stroke({ width: OUTLINE, color: EDGE, alignment: 1 });
    if (steps === 0) return;
    const inner = HEIGHT - OUTLINE * 2;
    const fillW = Math.max(inner, (WIDTH - OUTLINE * 2) * (steps / STEPS));
    const fill = steps / STEPS <= LOW_FRACTION ? FILL_LOW : FILL;
    g.roundRect(OUTLINE, OUTLINE, fillW, inner, RADIUS - OUTLINE).fill(fill);
    g.roundRect(OUTLINE + 3, OUTLINE + 2, fillW - 6, inner * 0.3, 3).fill({
      color: SHINE,
      alpha: 0.7,
    });
  }
}

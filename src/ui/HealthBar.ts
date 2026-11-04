import { Graphics } from "pixi.js";

const WIDTH = 200;
const HEIGHT = 16;
const BORDER = 2;
/** Health is shown as chunky cells so the bar reads as pixel art rather than a smooth gauge. */
const CELLS = 25;
const CELL_GAP = 2;
const BACK = 0x1a1410;
const FRAME = 0x0d0b09;
const FILL = 0xd93a2b;
const FILL_LOW = 0xff8c2b;
const SHINE = 0xff7a6a;
const LOW_FRACTION = 0.3;

/** Top-left health bar in screen space. Redrawn only when the shown cell count changes. */
export class HealthBar {
  readonly view = new Graphics();
  private shown = -1;

  update(health: number, max: number): void {
    const cells = Math.ceil((CELLS * Math.max(0, health)) / max);
    if (cells === this.shown) return;
    this.shown = cells;
    const g = this.view.clear();
    g.rect(0, 0, WIDTH, HEIGHT).fill(FRAME);
    g.rect(BORDER, BORDER, WIDTH - BORDER * 2, HEIGHT - BORDER * 2).fill(BACK);
    const cellW = (WIDTH - BORDER * 2 - CELL_GAP * (CELLS + 1)) / CELLS;
    const fill = cells / CELLS <= LOW_FRACTION ? FILL_LOW : FILL;
    for (let i = 0; i < cells; i++) {
      const x = BORDER + CELL_GAP + i * (cellW + CELL_GAP);
      g.rect(
        x,
        BORDER + CELL_GAP,
        cellW,
        HEIGHT - BORDER * 2 - CELL_GAP * 2,
      ).fill(fill);
      g.rect(x, BORDER + CELL_GAP, cellW, 2).fill(SHINE);
    }
  }
}

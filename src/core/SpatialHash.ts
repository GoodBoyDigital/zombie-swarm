import { ARENA } from "../config/arena";

export interface Positioned {
  x: number;
  y: number;
}

/**
 * Uniform grid rebuilt each frame. Cheap neighbour and segment queries for hundreds of bodies.
 * A flat array of cells over the arena plus its margin; anything outside clamps to the edge cell.
 */
export class SpatialHash<T extends Positioned> {
  private readonly cells: T[][];
  private readonly cols: number;
  private readonly rows: number;
  /** Cells touched since the last clear, so clearing doesn't walk the whole grid. */
  private readonly used: number[] = [];
  private readonly minX = -ARENA.margin;
  private readonly minY = -ARENA.margin;

  constructor(private readonly cellSize: number) {
    this.cols = Math.ceil((ARENA.width + ARENA.margin * 2) / cellSize);
    this.rows = Math.ceil((ARENA.height + ARENA.margin * 2) / cellSize);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }

  insert(item: T): void {
    const i = this.col(item.x) + this.row(item.y) * this.cols;
    const bucket = this.cells[i];
    if (bucket.length === 0) this.used.push(i);
    bucket.push(item);
  }

  /** Visit every item whose cell overlaps the axis-aligned box. Items may be visited once per call. */
  queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    visit: (item: T) => void,
  ): void {
    const cx0 = this.col(minX);
    const cy0 = this.row(minY);
    const cx1 = this.col(maxX);
    const cy1 = this.row(maxY);
    for (let cy = cy0; cy <= cy1; cy++) {
      const rowStart = cy * this.cols;
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = this.cells[rowStart + cx];
        for (let i = 0; i < bucket.length; i++) visit(bucket[i]);
      }
    }
  }

  private col(x: number): number {
    const c = Math.floor((x - this.minX) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private row(y: number): number {
    const r = Math.floor((y - this.minY) / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }
}

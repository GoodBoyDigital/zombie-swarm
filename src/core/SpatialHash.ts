export interface Positioned {
  x: number;
  y: number;
}

/** Uniform grid rebuilt each frame. Cheap neighbour and segment queries for hundreds of bodies. */
export class SpatialHash<T extends Positioned> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    for (const bucket of this.cells.values()) bucket.length = 0;
  }

  insert(item: T): void {
    const key = this.key(item.x, item.y);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
  }

  /** Visit every item whose cell overlaps the axis-aligned box. Items may be visited once per call. */
  queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    visit: (item: T) => void,
  ): void {
    const cx0 = Math.floor(minX / this.cellSize);
    const cy0 = Math.floor(minY / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cy1 = Math.floor(maxY / this.cellSize);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = this.cells.get(this.cellKey(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) visit(item);
      }
    }
  }

  private key(x: number, y: number): number {
    return this.cellKey(
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
    );
  }

  private cellKey(cx: number, cy: number): number {
    // Offset so negative cells stay unique. Arena coords never exceed +/- 32k cells.
    return (cx + 32768) * 65536 + (cy + 32768);
  }
}

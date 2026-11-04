/** Frames of history behind the smoothed numbers. */
const SMOOTHING_FRAMES = 30;
const ALPHA = 1 / SMOOTHING_FRAMES;

/**
 * Wall-clock timing of the game step, by system. `lap` attributes the time since the previous
 * lap to a name; `add` books time measured elsewhere (floor stamps, which happen inside other
 * systems and are counted in both). Values are smoothed so the HUD reads steadily.
 */
export class Profiler {
  /** Smoothed milliseconds per frame, by name, in first-seen order. */
  readonly smoothed: Record<string, number> = {};
  private readonly frame: Record<string, number> = {};
  private last = 0;
  private frameStart = 0;
  private renderStart = 0;

  beginFrame(): void {
    this.frameStart = this.last = performance.now();
    for (const name in this.frame) this.frame[name] = 0;
  }

  lap(name: string): void {
    const now = performance.now();
    this.add(name, now - this.last);
    this.last = now;
  }

  add(name: string, ms: number): void {
    this.frame[name] = (this.frame[name] ?? 0) + ms;
  }

  endFrame(): void {
    const now = performance.now();
    this.add("step", now - this.frameStart);
    for (const name in this.frame) this.smooth(name, this.frame[name]);
    this.renderStart = now;
  }

  /** Called after Pixi's render pass: everything since the step ended is the render's CPU cost. */
  endRender(): void {
    this.smooth("render", performance.now() - this.renderStart);
  }

  private smooth(name: string, ms: number): void {
    const prev = this.smoothed[name] ?? ms;
    this.smoothed[name] = prev + (ms - prev) * ALPHA;
  }

  /** One line per system, for the debug HUD. */
  report(): string {
    return Object.entries(this.smoothed)
      .filter(([name]) => name !== "step" && name !== "render")
      .map(([name, ms]) => `${name} ${ms.toFixed(2)}`)
      .join("   ");
  }
}

export const profiler = new Profiler();

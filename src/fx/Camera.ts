import type { Application, Container } from "pixi.js";
import { ARENA } from "../config/arena";

/** Fits the arena to the window and layers screen shake plus directional recoil kick on top. */
export class Camera {
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  private scale = 1;
  private baseX = 0;
  private baseY = 0;

  constructor(
    private readonly app: Application,
    private readonly world: Container,
  ) {
    this.fit();
    // Pixi resizes the screen a frame after the window event; its own event fires once that's done.
    app.renderer.on("resize", () => this.fit());
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Nudge the view, in world px. Used for gun recoil pushing the camera back. */
  kick(x: number, y: number): void {
    this.kickX += x;
    this.kickY += y;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.baseX) / this.scale + ARENA.width / 2,
      y: (sy - this.baseY) / this.scale + ARENA.height / 2,
    };
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    const decay = Math.exp(-dt * 14);
    this.kickX *= decay;
    this.kickY *= decay;
    // Linear response: single shots still register, sustained fire builds to a steady rumble.
    const shake = this.trauma;
    const sx = (Math.random() * 2 - 1) * 9 * shake + this.kickX;
    const sy = (Math.random() * 2 - 1) * 9 * shake + this.kickY;
    this.world.position.set(
      this.baseX + sx * this.scale,
      this.baseY + sy * this.scale,
    );
    this.world.rotation = (Math.random() * 2 - 1) * 0.006 * shake;
  }

  private fit(): void {
    const pad = ARENA.wallThickness + 40;
    const w = ARENA.width + pad * 2;
    const h = ARENA.height + pad * 2;
    this.scale = Math.min(
      this.app.screen.width / w,
      this.app.screen.height / h,
    );
    this.world.scale.set(this.scale);
    this.world.pivot.set(ARENA.width / 2, ARENA.height / 2);
    this.baseX = this.app.screen.width / 2;
    this.baseY = this.app.screen.height / 2;
    this.world.position.set(this.baseX, this.baseY);
  }
}

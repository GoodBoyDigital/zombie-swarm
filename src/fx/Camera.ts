import type { Application, Container } from "pixi.js";
import { ARENA } from "../config/arena";
import { CAMERA } from "../config/camera";

/**
 * Follows a target with an ease and clamps near the arena edge: the view stops just past it, showing
 * a strip of wall with darkness beyond, and zombies walk in out of the dark. Shake and kick sit on top.
 */
export class Camera {
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  private scale = 1;
  private baseX = 0;
  private baseY = 0;
  /** World point at the centre of the screen. */
  private x = ARENA.width / 2;
  private y = ARENA.height / 2;
  private halfViewW = 0;
  private halfViewH = 0;
  private fittedViewHeight = 0;

  constructor(
    private readonly app: Application,
    private readonly world: Container,
  ) {
    this.fit();
    // Pixi resizes the screen a frame after the window event; its own event fires once that's done.
    app.renderer.on("resize", () => this.fit());
  }

  /** Shake builds up to `cap`; 1 is a heavy hit, big blasts pass up to 2 for a longer, wider shake. */
  addTrauma(amount: number, cap = 1): void {
    this.trauma = Math.max(this.trauma, Math.min(cap, this.trauma + amount));
  }

  /** Nudge the view, in world px. Used for gun recoil pushing the camera back. */
  kick(x: number, y: number): void {
    this.kickX += x;
    this.kickY += y;
  }

  /** Jump straight to a point, e.g. on spawn, without easing in from wherever the camera was. */
  snapTo(x: number, y: number): void {
    this.x = this.clampX(x);
    this.y = this.clampY(y);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.baseX) / this.scale + this.x,
      y: (sy - this.baseY) / this.scale + this.y,
    };
  }

  update(dt: number, targetX: number, targetY: number): void {
    if (CAMERA.viewHeight !== this.fittedViewHeight) this.fit();
    const ease = 1 - Math.exp(-dt * CAMERA.followRate);
    this.x += (this.clampX(targetX) - this.x) * ease;
    this.y += (this.clampY(targetY) - this.y) * ease;
    this.world.pivot.set(this.x, this.y);

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

  /**
   * Zoom so `viewHeight` of the arena fills the screen, but never so far out that the view is wider
   * or taller than the arena itself, or the clamp couldn't hide the edges on a very wide window.
   */
  private fit(): void {
    const { width: sw, height: sh } = this.app.screen;
    this.scale = Math.max(
      sh / CAMERA.viewHeight,
      sw / ARENA.width,
      sh / ARENA.height,
    );
    this.fittedViewHeight = CAMERA.viewHeight;
    this.halfViewW = sw / this.scale / 2;
    this.halfViewH = sh / this.scale / 2;
    this.world.scale.set(this.scale);
    this.baseX = sw / 2;
    this.baseY = sh / 2;
    this.world.position.set(this.baseX, this.baseY);
    this.snapTo(this.x, this.y);
    this.world.pivot.set(this.x, this.y);
  }

  private clampX(x: number): number {
    const reveal = CAMERA.edgeReveal;
    const min = this.halfViewW - reveal;
    return Math.min(ARENA.width - min, Math.max(min, x));
  }

  private clampY(y: number): number {
    const reveal = CAMERA.edgeReveal;
    const min = this.halfViewH - reveal;
    return Math.min(ARENA.height - min, Math.max(min, y));
  }
}

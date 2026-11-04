import { Container, Graphics, GraphicsPath, Rectangle } from "pixi.js";
import { rand } from "../core/random";
import { DomeFilter } from "./DomeFilter";

const FILL = 0x7fe8ff;
const RIM = 0xc8faff;
const ARC = 0x8cefff;
const RIM_WIDTH = 3;
/** Room around the rim for the filter's ripple to fade out in. */
const FILTER_PADDING = 6;
/** Arcs are thrown away and redrawn this often, seconds. */
const ARC_INTERVAL = 0.05;
/** Rim length per crackling arc, px. Small domes get at least two. */
const RIM_PER_ARC = 110;
/** Bolts to touching zombies drawn per redraw, at most. */
const MAX_BOLTS = 6;
/** Ripple features per world px across the dome, so ripples are the same size on any dome. */
const NOISE_PER_PX = 1 / 70;

/**
 * The look shared by the shield and the safety portal: a soft cyan dome with a bright rim that
 * ripples the floor and zombies seen through it, crackling arcs along the rim, and bolts to anything
 * touching it. Position, radius and visibility are written by the owner; call update every frame.
 */
export class ElectricDome {
  readonly view = new Container({ label: "electricDome" });
  x = 0;
  y = 0;
  radius = 0;
  /** 0..1, for the opening, the closing flicker and fades. */
  visibility = 1;
  /** Displacement through the dome, px. */
  ripple = 0;
  /** Read at render time, after everything has moved, so a dome on the player never trails him. */
  follow: { x: number; y: number } | null = null;
  private readonly layer = new Container();
  private readonly body = new Graphics();
  private readonly arcs = new Graphics();
  private readonly filter = new DomeFilter();
  private drawnRadius = -1;
  private arcTimer = 0;
  private time = 0;
  /** Touch points waiting for a bolt, flat x, y pairs relative to the centre. */
  private readonly touches: number[] = [];

  constructor() {
    this.arcs.blendMode = "add";
    this.layer.addChild(this.body);
    this.layer.filters = [this.filter];
    this.view.addChild(this.layer, this.arcs);
    this.view.onRender = (renderer) => {
      if (this.follow) this.view.position.set(this.follow.x, this.follow.y);
      this.filter.prepare(renderer);
    };
    this.view.once("destroyed", () => this.filter.destroy());
  }

  /** A zombie touching the edge at world (x, y): a bolt jumps to it on the next redraw. */
  touch(x: number, y: number): void {
    if (this.touches.length >= MAX_BOLTS * 2) return;
    this.touches.push(x - this.x, y - this.y);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.follow) {
      this.x = this.follow.x;
      this.y = this.follow.y;
    }
    this.view.position.set(this.x, this.y);
    if (this.radius !== this.drawnRadius) this.drawBody();
    this.body.alpha = this.visibility;
    this.arcs.alpha = this.visibility;
    const half = this.radius + RIM_WIDTH / 2 + FILTER_PADDING;
    const u = this.filter.uniforms;
    u.uEdge = this.radius / half;
    u.uStrength = this.ripple * this.visibility;
    u.uNoiseScale = half * NOISE_PER_PX;
    u.uTime = this.time;
    this.arcTimer -= dt;
    if (this.arcTimer > 0) return;
    this.arcTimer = ARC_INTERVAL;
    this.drawArcs();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private drawBody(): void {
    const r = Math.max(1, this.radius);
    this.drawnRadius = this.radius;
    this.filter.padding = FILTER_PADDING;
    // The body's own extent (rim outer edge), so the filter never measures bounds; padding goes on top.
    const extent = r + RIM_WIDTH / 2;
    this.layer.filterArea = new Rectangle(
      -extent,
      -extent,
      extent * 2,
      extent * 2,
    );
    this.body
      .clear()
      .circle(0, 0, r)
      .fill({ color: FILL, alpha: 0.12 })
      // A soft inner band, then the hard rim.
      .circle(0, 0, r - 5)
      .stroke({ width: 8, color: FILL, alpha: 0.14 })
      .circle(0, 0, r)
      .stroke({ width: RIM_WIDTH, color: RIM, alpha: 0.9 });
  }

  private drawArcs(): void {
    this.arcs.clear();
    const r = this.radius;
    if (r < 4) return;
    // Glow and core stroke the same jagged path.
    const g = new GraphicsPath();
    const count = Math.max(2, Math.round((Math.PI * 2 * r) / RIM_PER_ARC));
    for (let i = 0; i < count; i++) {
      const a0 = rand(0, Math.PI * 2);
      const span = rand(0.35, 0.9) * (RIM_PER_ARC / r);
      const steps = 5 + Math.floor(rand(0, 4));
      g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
      for (let s = 1; s <= steps; s++) {
        const a = a0 + (span * s) / steps;
        const rr = s === steps ? r : r + rand(-5, 4);
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    // Bolts from the rim out to whatever is pressing on it.
    for (let i = 0; i < this.touches.length; i += 2) {
      const tx = this.touches[i];
      const ty = this.touches[i + 1];
      const d = Math.hypot(tx, ty) || 1;
      const nx = tx / d;
      const ny = ty / d;
      g.moveTo(nx * r, ny * r);
      const steps = 3;
      for (let s = 1; s <= steps; s++) {
        const k = r + ((d - r) * s) / steps;
        const j = s === steps ? 0 : rand(-4, 4);
        g.lineTo(nx * k - ny * j, ny * k + nx * j);
      }
    }
    this.touches.length = 0;
    this.arcs
      .path(g)
      .stroke({ width: 5, color: ARC, alpha: 0.25, join: "miter" })
      .path(g)
      .stroke({ width: 1.6, color: 0xffffff, alpha: 0.95, join: "miter" });
  }
}

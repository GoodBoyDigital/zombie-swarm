import { Container, Graphics } from "pixi.js";
import { CONTROLS } from "../config/controls";

const INK = 0x151a15;
const CREAM = 0xfff6e0;
const FIRE = 0xff2a2a;

/** One floating stick: it centres where its thumb landed and is gone when the thumb lifts. */
class Stick {
  readonly view = new Container();
  private readonly base = new Graphics();
  private readonly knob = new Graphics();
  /** The touch holding this stick, or null while nobody is. */
  pointerId: number | null = null;
  /** Knob offset from the centre as a share of the stick's travel: length 0..1, no deadzone applied. */
  x = 0;
  y = 0;
  private drawnRadius = 0;
  private drawnKnob = 0;
  private drawnColor = -1;

  constructor(label: string) {
    this.view.label = label;
    this.view.addChild(this.base, this.knob);
    this.view.visible = false;
  }

  press(pointerId: number, x: number, y: number): void {
    this.pointerId = pointerId;
    this.x = 0;
    this.y = 0;
    this.view.position.set(x, y);
    this.view.alpha = CONTROLS.stickAlpha;
    this.view.visible = true;
    this.draw(CREAM);
  }

  /** Follow the thumb, with the knob held inside the ring. */
  drag(x: number, y: number, knobColor: (length: number) => number): void {
    const radius = CONTROLS.stickRadius;
    const dx = (x - this.view.x) / radius;
    const dy = (y - this.view.y) / radius;
    const over = Math.max(1, Math.hypot(dx, dy));
    this.x = dx / over;
    this.y = dy / over;
    this.draw(knobColor(Math.hypot(this.x, this.y)));
  }

  release(): void {
    this.pointerId = null;
    this.x = 0;
    this.y = 0;
    this.view.visible = false;
  }

  /** Flat ring and knob with an ink outline. Redrawn only when a size or the knob colour changes. */
  private draw(knobColor: number): void {
    const { stickRadius: radius, knobRadius } = CONTROLS;
    this.knob.position.set(this.x * radius, this.y * radius);
    if (radius !== this.drawnRadius) {
      this.drawnRadius = radius;
      this.base
        .clear()
        .circle(0, 0, radius)
        .fill({ color: INK, alpha: 0.25 })
        .stroke({ width: 7, color: INK })
        .circle(0, 0, radius)
        .stroke({ width: 3, color: CREAM });
    }
    if (knobRadius === this.drawnKnob && knobColor === this.drawnColor) return;
    this.drawnKnob = knobRadius;
    this.drawnColor = knobColor;
    this.knob
      .clear()
      .circle(0, 0, knobRadius)
      .fill(knobColor)
      .stroke({ width: 4, color: INK });
  }
}

/**
 * Twin floating touch sticks. A thumb landing on the left half of the screen gets the move stick,
 * one on the right half the aim stick, each followed by its own pointer id so both work at once.
 * Input feeds it touches and reads the sticks back; the view goes in the HUD layer.
 */
export class TouchSticks {
  readonly view = new Container({ label: "touchSticks" });
  private readonly moveStick = new Stick("moveStick");
  private readonly aimStick = new Stick("aimStick");
  private active = true;

  constructor() {
    this.view.eventMode = "none";
    this.view.addChild(this.moveStick.view, this.aimStick.view);
  }

  /** Off while there is nothing to steer (end card, aboard the chopper): held sticks let go, new touches spawn none. */
  set enabled(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (!on) this.releaseAll();
  }

  /** A new touch at a screen point. `screenWidth` decides which half, and so which stick, it gets. */
  press(pointerId: number, x: number, y: number, screenWidth: number): void {
    if (!this.active) return;
    const stick = x < screenWidth / 2 ? this.moveStick : this.aimStick;
    if (stick.pointerId === null) stick.press(pointerId, x, y);
  }

  drag(pointerId: number, x: number, y: number): void {
    if (pointerId === this.moveStick.pointerId)
      this.moveStick.drag(x, y, () => CREAM);
    if (pointerId === this.aimStick.pointerId)
      this.aimStick.drag(x, y, (length) =>
        length > CONTROLS.aimDeadzone ? FIRE : CREAM,
      );
  }

  release(pointerId: number): void {
    if (pointerId === this.moveStick.pointerId) this.moveStick.release();
    if (pointerId === this.aimStick.pointerId) this.aimStick.release();
  }

  releaseAll(): void {
    this.moveStick.release();
    this.aimStick.release();
  }

  /** The move stick's knob offset, length 0..1, before any deadzone. */
  get move(): { x: number; y: number } {
    return this.moveStick;
  }

  get aim(): { x: number; y: number } {
    return this.aimStick;
  }
}

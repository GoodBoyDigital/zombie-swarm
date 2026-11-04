import type { Application, FederatedPointerEvent } from "pixi.js";
import { isTyping } from "../Game";

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
};

/** Keyboard movement plus pointer position (in screen space) and fire state. */
export class Input {
  private readonly held = new Set<string>();
  /** Pointer position in screen pixels. */
  readonly pointer = { x: 0, y: 0 };
  private firing = false;
  private firePressed = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (e.code in MOVE_KEYS) e.preventDefault();
    this.held.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private readonly onBlur = () => {
    this.held.clear();
    this.firing = false;
    this.firePressed = false;
  };

  constructor(private readonly app: Application) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    const track = (e: FederatedPointerEvent) => {
      this.pointer.x = e.global.x;
      this.pointer.y = e.global.y;
    };
    app.stage.on("pointermove", track);
    app.stage.on("pointerdown", (e) => {
      track(e);
      if (e.button === 0) {
        this.firing = true;
        this.firePressed = true;
      }
    });
    app.stage.on("pointerup", (e) => {
      if (e.button === 0) this.firing = false;
    });
    app.stage.on("pointerupoutside", () => (this.firing = false));
    app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Keep clicks that begin and end between frames, while still supporting held fire. */
  consumeFire(): boolean {
    const fire = this.firing || this.firePressed;
    this.firePressed = false;
    return fire;
  }

  /** Detach from the window and stage so a rebuilt game starts with clean input. */
  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.app.stage.removeAllListeners();
  }

  /** Normalised movement vector from whichever keys are down. */
  moveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const dir = MOVE_KEYS[code];
      if (dir) {
        x += dir[0];
        y += dir[1];
      }
    }
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }
}

import { Point, type Application, type FederatedPointerEvent } from "pixi.js";
import { CONTROLS } from "../config/controls";
import { isTyping } from "../Game";
import { TouchSticks } from "./TouchSticks";

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
/** Standard-mapping gamepad buttons. */
const PAD_A = 0;
const PAD_X = 2;
const PAD_RT = 7;
const PAD_START = 9;

export type InputDevice = "mouse" | "touch" | "gamepad";

/**
 * Where the player wants to aim: at a screen point (the mouse), or along a unit direction (a stick).
 * A zero direction is a stick at rest: keep facing the same way.
 */
export type Aim =
  | { kind: "point"; x: number; y: number }
  | { kind: "direction"; x: number; y: number };

/**
 * The last device used wins. Kept outside the class so it outlives a restart's fresh Input, and
 * phones start on touch so no mouse crosshair shows before the first tap.
 */
let device: InputDevice = matchMedia("(pointer: coarse)").matches
  ? "touch"
  : "mouse";

/**
 * Radial deadzone: zero inside it, then the length rescaled to run 0..1 from its edge to full tilt,
 * so a stick eases in from nothing instead of jumping. Returns whether the stick is past it.
 */
function deadzone(
  x: number,
  y: number,
  dead: number,
  out: { x: number; y: number },
): boolean {
  const length = Math.hypot(x, y);
  const scale =
    length > dead ? Math.min(1, (length - dead) / (1 - dead)) / length : 0;
  out.x = x * scale;
  out.y = y * scale;
  return scale > 0;
}

/**
 * The one front door for input, whatever the device: keyboard and mouse, floating touch sticks, or a
 * gamepad. The game reads three intents: `moveAxis()`, `aim` and `consumeFire()`.
 */
export class Input {
  private readonly held = new Set<string>();
  /** Touch sticks; the game puts their view in the HUD and switches them off when there is nothing to steer. */
  readonly sticks = new TouchSticks();
  private readonly pointer = { kind: "point" as const, x: 0, y: 0 };
  private readonly stickAim = { kind: "direction" as const, x: 0, y: 0 };
  private readonly axis = { x: 0, y: 0 };
  private firing = false;
  private firePressed = false;
  /**
   * The gamepad as last polled, deadzones applied. The buttons start "held" so one still down from
   * the restart that built this Input isn't taken for a fresh press.
   */
  private readonly pad = {
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    fire: false,
    confirm: true,
    reload: true,
  };
  /** Gamepad A or Start went down this frame: the end card's main button. */
  confirmPressed = false;
  /** Gamepad X went down this frame: the R key's job. */
  reloadPressed = false;
  private readonly touchPoint = new Point();

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
    this.sticks.releaseAll();
  };
  // Touches are followed on the window by pointer id once a stick has one: Pixi reports a move only
  // to what is under it, and never reports a touch the system cancels, which would leave a stick held.
  private readonly onTouchMove = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const p = this.touchPoint;
    this.app.renderer.events.mapPositionToPoint(p, e.clientX, e.clientY);
    this.sticks.drag(e.pointerId, p.x, p.y);
  };
  private readonly onTouchEnd = (e: PointerEvent) =>
    this.sticks.release(e.pointerId);

  constructor(private readonly app: Application) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointermove", this.onTouchMove);
    window.addEventListener("pointerup", this.onTouchEnd);
    window.addEventListener("pointercancel", this.onTouchEnd);

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      // Browsers send moves for a mouse that hasn't; those must not take over from a gamepad.
      if (e.global.x === this.pointer.x && e.global.y === this.pointer.y)
        return;
      this.trackMouse(e);
    });
    app.stage.on("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        this.use("touch");
        // A touch on a button (the end card's) is the button's; only bare screen spawns a stick.
        if (e.target === app.stage)
          this.sticks.press(
            e.pointerId,
            e.global.x,
            e.global.y,
            app.screen.width,
          );
        return;
      }
      this.trackMouse(e);
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

  /** Which device is steering right now: the last one used. */
  get device(): InputDevice {
    return device;
  }

  /** Once a frame, before anything reads input: the gamepad has no events, so it is polled. */
  update(): void {
    const pad = this.pad;
    const hadConfirm = pad.confirm;
    const hadReload = pad.reload;
    // Start from nothing held, so a pad unplugged mid-push doesn't leave its stick stuck over.
    pad.move.x = pad.move.y = pad.aim.x = pad.aim.y = 0;
    pad.fire = pad.confirm = pad.reload = false;
    const dead = CONTROLS.gamepadDeadzone;
    // The API itself is missing on insecure origins, such as a phone on the LAN dev server.
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp?.connected || gp.axes.length < 4) continue;
      const moving = deadzone(gp.axes[0], gp.axes[1], dead, pad.move);
      const aiming = deadzone(gp.axes[2], gp.axes[3], dead, pad.aim);
      const trigger = gp.buttons[PAD_RT]?.value > CONTROLS.triggerThreshold;
      pad.fire = aiming || trigger;
      pad.confirm = !!(
        gp.buttons[PAD_A]?.pressed || gp.buttons[PAD_START]?.pressed
      );
      pad.reload = !!gp.buttons[PAD_X]?.pressed;
      // The first pad doing anything is the one in use, and takes over from mouse or touch.
      if (moving || pad.fire || pad.confirm || pad.reload) {
        this.use("gamepad");
        break;
      }
    }
    this.confirmPressed = pad.confirm && !hadConfirm;
    this.reloadPressed = pad.reload && !hadReload;
  }

  /** Movement, length 0..1: the keyboard is all or nothing, a half-tilted stick walks. */
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
    const axis = this.axis;
    if (len > 0) {
      axis.x = x / len;
      axis.y = y / len;
      return axis;
    }
    if (device === "gamepad") return this.pad.move;
    // Only a touch holds these; any other device let them go when it took over.
    const stick = this.sticks.move;
    deadzone(stick.x, stick.y, CONTROLS.moveDeadzone, axis);
    return axis;
  }

  /** Where to aim: the mouse's screen point, or the direction of the stick in use. */
  get aim(): Aim {
    if (device === "mouse") return this.pointer;
    const stick = device === "touch" ? this.sticks.aim : this.pad.aim;
    const dead = device === "touch" ? CONTROLS.aimDeadzone : 0;
    const length = Math.hypot(stick.x, stick.y);
    const scale = length > dead ? 1 / length : 0;
    this.stickAim.x = stick.x * scale;
    this.stickAim.y = stick.y * scale;
    return this.stickAim;
  }

  /**
   * Keep clicks that begin and end between frames, while still supporting held fire. An aim stick
   * fires for as long as it is pushed past its deadzone, and so does the gamepad's right trigger.
   */
  consumeFire(): boolean {
    const stick = this.sticks.aim;
    const fire =
      this.firing ||
      this.firePressed ||
      (device === "gamepad" && this.pad.fire) ||
      Math.hypot(stick.x, stick.y) > CONTROLS.aimDeadzone;
    this.firePressed = false;
    return fire;
  }

  /** Detach from the window and stage so a rebuilt game starts with clean input. */
  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointermove", this.onTouchMove);
    window.removeEventListener("pointerup", this.onTouchEnd);
    window.removeEventListener("pointercancel", this.onTouchEnd);
    this.app.stage.removeAllListeners();
  }

  private trackMouse(e: FederatedPointerEvent): void {
    this.pointer.x = e.global.x;
    this.pointer.y = e.global.y;
    this.use("mouse");
  }

  /** Hand over to another device, letting go of whatever the old one was holding down. */
  private use(next: InputDevice): void {
    if (next === device) return;
    device = next;
    this.firing = false;
    this.firePressed = false;
    this.sticks.releaseAll();
  }
}

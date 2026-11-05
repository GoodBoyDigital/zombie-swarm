import { Container, Graphics, Text, type Application } from "pixi.js";
import { RUN } from "../config/run";
import type { Camera } from "../fx/Camera";
import type { Run } from "../run/Run";
import { UI_FONT } from "./font";
import { SAFE_AREA } from "./safeArea";

const INK = 0x151a15;
const CREAM = 0xfff6e0;
const URGENT = 0xff4436;
const GO = 0x7dff6a;
const PAD = 0xf2c230;
const TOP = 8;
/** The arrow keeps this far in from the screen edge, CSS px. */
const ARROW_INSET = 64;
/** The arrow hides once the pad's centre is this far inside the screen edge, CSS px. */
const ON_SCREEN_MARGIN = 0;

const style = (size: number) => ({
  ...UI_FONT,
  fontSize: size,
  fill: CREAM,
  stroke: {
    color: INK,
    width: Math.max(4, size * 0.2),
    join: "round" as const,
  },
});

export const formatTime = (seconds: number): string => {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Top-centre run readout: level, time to extraction, then what to do once the chopper is called;
 * plus an edge arrow toward the landing zone whenever it is off screen.
 */
export class RunHud {
  readonly view = new Container({ label: "runHud" });
  private readonly label = new Text({ text: "", style: style(14) });
  private readonly timer = new Text({ text: "", style: style(36) });
  private readonly status = new Text({ text: "", style: style(18) });
  private readonly arrow = new Container({ label: "lzArrow" });
  private readonly pointer = new Graphics({ label: "lzArrowHead" });
  private time = 0;

  constructor(private readonly app: Application) {
    for (const t of [this.label, this.timer, this.status]) t.anchor.set(0.5, 0);
    // The head orbits the H badge, pointing at the pad.
    this.pointer.poly([46, 0, 20, -15, 25, 0, 20, 15]).fill(PAD).stroke({
      color: INK,
      width: 4,
      join: "round",
    });
    const badge = new Graphics().circle(0, 0, 16).fill(PAD).stroke({
      color: INK,
      width: 4,
    });
    const h = new Text({
      text: "H",
      style: { ...style(16), fill: INK, stroke: undefined },
    });
    h.anchor.set(0.5);
    this.arrow.addChild(this.pointer, badge, h);
    this.arrow.visible = false;
    this.view.addChild(this.label, this.timer, this.status, this.arrow);
  }

  update(dt: number, run: Run, camera: Camera): void {
    this.time += dt;
    const { width } = this.app.screen;
    const cx = width / 2;
    const top = TOP + SAFE_AREA.top;
    this.label.position.set(cx, top);
    this.timer.position.set(cx, top + 16);
    // Below the debug readout's third line, which runs under the timer on narrower windows.
    this.status.position.set(cx, top + 98);
    const level = run.level.name.toUpperCase();

    if (run.phase === "countdown") {
      const left = run.remaining;
      const urgent = left <= RUN.finalSeconds;
      this.label.text = `${level} · EXTRACTION IN`;
      this.timer.text = formatTime(left);
      this.timer.style.fill = urgent ? URGENT : CREAM;
      // The last minute throbs once a second, on the tick.
      const beat = urgent ? 1 + 0.12 * Math.max(0, 1 - (left % 1) * 4) : 1;
      this.timer.scale.set(beat);
      this.status.text = urgent ? "HOLD OUT! CHOPPER INBOUND" : "";
      this.status.style.fill = URGENT;
    } else {
      this.label.text = level;
      this.timer.scale.set(1);
      this.timer.style.fill = GO;
      const flash = Math.floor(this.time * 3) % 2 === 0;
      this.status.style.fill = flash ? GO : CREAM;
      this.timer.text = {
        countdown: "",
        inbound: "CHOPPER INBOUND",
        landed: "GET TO THE CHOPPER!",
        boarded: "EXTRACTED!",
        over: "EXTRACTED!",
      }[run.phase];
      this.status.text =
        run.phase === "inbound"
          ? "HEAD FOR THE LANDING ZONE"
          : run.phase === "landed"
            ? "STAND ON THE PAD TO BOARD"
            : "";
    }
    this.updateArrow(run, camera);
  }

  private updateArrow(run: Run, camera: Camera): void {
    const zone = run.chopper?.zone;
    if (!zone || run.aboard) {
      this.arrow.visible = false;
      return;
    }
    const { width, height } = this.app.screen;
    const p = camera.worldToScreen(zone.x, zone.y);
    const m = ON_SCREEN_MARGIN;
    const onScreen = p.x > m && p.y > m && p.x < width - m && p.y < height - m;
    this.arrow.visible = !onScreen;
    if (onScreen) return;
    // Clamp the direction from screen centre onto a rectangle inset from the edges.
    const cx = width / 2;
    const cy = height / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const hx = cx - ARROW_INSET;
    const hy = cy - ARROW_INSET;
    const k = Math.min(hx / Math.abs(dx || 1e-6), hy / Math.abs(dy || 1e-6));
    const angle = Math.atan2(dy, dx);
    const bob = 4 * Math.sin(this.time * 8);
    this.arrow.position.set(
      cx + dx * k - Math.cos(angle) * bob,
      cy + dy * k - Math.sin(angle) * bob,
    );
    this.pointer.rotation = angle;
  }
}

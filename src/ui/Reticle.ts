import { Container, Graphics, Point } from "pixi.js";
import type { Weapon } from "../combat/Weapon";
import { CONTROLS } from "../config/controls";
import type { Input } from "../core/Input";
import type { Player } from "../entities/Player";
import type { Zombie } from "../entities/Zombie";

/** Crosshair width on screen in px. The reload ring scales with it. */
export const RETICLE_SIZE = 72;
const CROSS_COLOR = 0xff2a2a;
const CROSS_OUTLINE = 0x140808;
const CROSS_RADIUS = RETICLE_SIZE * 0.26;
const CROSS_LINE = RETICLE_SIZE * 0.045;
/** Ticks run from just inside the circle to well outside it, leaving the centre open. */
const TICK_INNER = CROSS_RADIUS * 0.55;
const TICK_OUTER = RETICLE_SIZE * 0.5;
const DOT_RADIUS = RETICLE_SIZE * 0.035;
const RING_RADIUS = RETICLE_SIZE * 0.65;
const RING_WIDTH = RETICLE_SIZE * 0.1;
const RING_BACK = 0x000000;
const RING_FILL = 0xffd84a;
const RING_DONE = 0xffffff;
/** The ring snaps bright and shrinks back when a reload lands. */
const FLASH_SECONDS = 0.18;
const FLASH_SCALE = 1.35;
/** With a stick the crosshair shrinks to a marker out in front of the gun, joined to it by a line. */
const STICK_SCALE = 0.45;
const LINE_WIDTH = 2.5;
/** The aim line starts this far past the muzzle and stops this short of the marker's centre, px. */
const LINE_GAP = 6;
/** Lock-on brackets: four arcs round the locked zombie, this far outside its body, never smaller than the minimum, px. */
const LOCK_MARGIN = 6;
const LOCK_MIN_RADIUS = 13;
const LOCK_LINE = 3;
/** Share of each quarter turn an arc covers; the rest is gap. */
const LOCK_ARC = 0.55;
/** The brackets turn slowly, radians/s, and a fresh lock pops in from this scale. */
const LOCK_SPIN = 1.6;
const LOCK_POP_SCALE = 1.7;
const LOCK_POP_SECONDS = 0.14;

/**
 * Crosshair under the pointer in screen space, so camera shake never moves it. While the weapon
 * reloads a ring fills clockwise around it with the seconds left underneath. A stick has no pointer,
 * so in touch and gamepad modes it becomes a small marker a fixed way down the barrel's line, with
 * a line from the muzzle to show where the gun points. When stick aiming locks on to a zombie the
 * line jumps to it and the marker becomes brackets around it.
 */
export class Reticle {
  readonly view = new Container();
  private readonly line = new Graphics();
  /** The crosshair and its reload ring, shrunk together in stick modes. */
  private readonly head = new Container();
  private readonly cross = drawCrosshair();
  private readonly brackets = new Graphics();
  private bracketRadius = 0;
  private lockedOn: Zombie | null = null;
  private lockPop = 0;
  private readonly ring = new Graphics();
  private readonly reloadUi = new Container();
  private wasReloading = false;
  private flash = 0;
  private mouseInside = true;
  private readonly muzzle = new Point();
  private readonly mark = new Point();

  constructor(private readonly input: Input) {
    this.reloadUi.addChild(this.ring);
    this.reloadUi.visible = false;
    this.head.addChild(this.reloadUi, this.cross);
    this.view.addChild(this.line, this.brackets, this.head);
    this.view.eventMode = "none";

    const hide = () => (this.mouseInside = false);
    const show = () => (this.mouseInside = true);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("mouseenter", show);
    window.addEventListener("blur", hide);
  }

  update(dt: number, weapon: Weapon, player: Player): void {
    const aim = this.input.aim;
    const stick = aim.kind === "direction";
    const lock = stick ? player.lock : null;
    this.line.visible = stick;
    this.brackets.visible = !!lock;
    this.cross.visible = !lock;
    this.head.scale.set(stick ? STICK_SCALE : 1);
    if (stick) {
      this.view.visible = player.view.visible;
      this.aimLine(dt, player, lock);
    } else {
      this.view.visible = this.mouseInside;
      this.view.position.set(aim.x, aim.y);
    }
    const reloading = weapon.reloading;
    if (this.wasReloading && !reloading) this.flash = FLASH_SECONDS;
    this.wasReloading = reloading;
    this.flash = Math.max(0, this.flash - dt);

    const flashing = this.flash > 0;
    this.reloadUi.visible = reloading || flashing;
    if (!this.reloadUi.visible) {
      this.reloadUi.scale.set(1);
      return;
    }
    const t = flashing ? this.flash / FLASH_SECONDS : 0;
    const progress = reloading
      ? 1 - weapon.reloadLeft / weapon.reloadDuration
      : 1;
    this.reloadUi.scale.set(1 + (FLASH_SCALE - 1) * t);
    this.drawRing(progress, flashing ? RING_DONE : RING_FILL);
  }

  /**
   * Put the marker out along the barrel, or on the locked zombie, and draw the line to it from the
   * muzzle. Everything is in the view's own space, with the marker at its origin.
   */
  private aimLine(dt: number, player: Player, lock: Zombie | null): void {
    // The world container: its transform carries the camera's zoom and shake.
    const world = player.view.parent!;
    const from = player.barrelToScreen(LINE_GAP, this.muzzle);
    const to = lock
      ? world.toGlobal(lock, this.mark)
      : player.barrelToScreen(CONTROLS.aimDistance, this.mark);
    this.view.position.copyFrom(to);
    let gap = LINE_GAP;
    if (lock) {
      gap = Math.max(
        LOCK_MIN_RADIUS,
        lock.hitRadius * world.scale.x + LOCK_MARGIN,
      );
      this.lockBrackets(dt, lock, gap);
    } else this.lockedOn = null;
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const length = Math.hypot(dx, dy);
    const g = this.line.clear();
    if (CONTROLS.aimLine <= 0 || length <= gap) return;
    // From just short of the marker back toward the muzzle.
    const near = gap / length;
    const far = near + (1 - near) * Math.min(1, CONTROLS.aimLine);
    g.moveTo(dx * near, dy * near).lineTo(dx * far, dy * far);
    g.stroke({ width: LINE_WIDTH + 3, color: CROSS_OUTLINE, cap: "round" });
    g.moveTo(dx * near, dy * near).lineTo(dx * far, dy * far);
    g.stroke({ width: LINE_WIDTH, color: CROSS_COLOR, cap: "round" });
    g.alpha = CONTROLS.aimLineAlpha;
  }

  /** Four arcs turning slowly round the locked zombie, popping in when the lock moves to a new one. */
  private lockBrackets(dt: number, lock: Zombie, radius: number): void {
    const g = this.brackets;
    if (lock !== this.lockedOn) {
      this.lockedOn = lock;
      this.lockPop = 1;
    }
    this.lockPop = Math.max(0, this.lockPop - dt / LOCK_POP_SECONDS);
    g.scale.set(1 + (LOCK_POP_SCALE - 1) * this.lockPop);
    g.rotation += dt * LOCK_SPIN;
    if (radius === this.bracketRadius) return;
    this.bracketRadius = radius;
    g.clear();
    const arcs = (width: number, color: number) => {
      for (let i = 0; i < 4; i++) {
        const start = (i * Math.PI) / 2;
        g.moveTo(radius * Math.cos(start), radius * Math.sin(start))
          .arc(0, 0, radius, start, start + (LOCK_ARC * Math.PI) / 2)
          .stroke({ width, color, cap: "round" });
      }
    };
    arcs(LOCK_LINE + 3, CROSS_OUTLINE);
    arcs(LOCK_LINE, CROSS_COLOR);
  }

  /** Full dark ring underneath, the filled share on top, starting at 12 o'clock and going clockwise. */
  private drawRing(progress: number, color: number): void {
    const start = -Math.PI / 2;
    this.ring
      .clear()
      .circle(0, 0, RING_RADIUS)
      .stroke({ width: RING_WIDTH + 2, color: RING_BACK, alpha: 0.7 });
    if (progress <= 0) return;
    // arc() joins from the pen's current point, so move it onto the ring first or a spoke is drawn from the centre.
    this.ring
      .moveTo(RING_RADIUS * Math.cos(start), RING_RADIUS * Math.sin(start))
      .arc(0, 0, RING_RADIUS, start, start + Math.PI * 2 * progress)
      .stroke({ width: RING_WIDTH, color });
  }
}

/**
 * Vector crosshair: drawn once, antialiased at device resolution, so it stays smooth at any size.
 * A dark underlay a little wider than each red stroke keeps it readable over the horde and the floor.
 */
function drawCrosshair(): Graphics {
  const g = new Graphics();
  const shape = (width: number, color: number) => {
    g.circle(0, 0, CROSS_RADIUS).stroke({ width, color, cap: "round" });
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      g.moveTo(x * TICK_INNER, y * TICK_INNER)
        .lineTo(x * TICK_OUTER, y * TICK_OUTER)
        .stroke({ width, color, cap: "round" });
    }
  };
  shape(CROSS_LINE + 3, CROSS_OUTLINE);
  shape(CROSS_LINE, CROSS_COLOR);
  g.circle(0, 0, DOT_RADIUS + 1.5).fill(CROSS_OUTLINE);
  g.circle(0, 0, DOT_RADIUS).fill(CROSS_COLOR);
  return g;
}

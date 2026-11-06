import { applyHotConfig, trackHotConfig } from "../debug/hotConfig";
/** Touch sticks, gamepad and stick-mode aiming. Stick sizes are screen px; aim distances are world px. */
export const CONTROLS = {
  /** Touch stick base ring radius, and how far the knob travels from where the thumb landed. */
  stickRadius: 60,
  knobRadius: 39,
  /** Opacity of the base ring. The knob is solid, so the ring never shows through it. */
  stickAlpha: 0.6,
  /** Share of the move stick's travel that does nothing; the rest rescales to 0..1 walking speed. */
  moveDeadzone: 0.15,
  /** The aim stick turns the player and fires once pushed past this share of its travel. */
  aimDeadzone: 0.25,
  /**
   * Radial deadzone on both gamepad sticks, rescaled so movement starts from zero at its edge. The
   * right stick aims and fires past it.
   */
  gamepadDeadzone: 0.2,
  /** How far the right trigger has to be pulled to fire, 0..1. */
  triggerThreshold: 0.3,
  /**
   * Stick aiming points the barrel at a spot this far from the player along the stick, and the small
   * reticle sits there.
   */
  aimDistance: 150,
  /** How much of the way from the muzzle to that reticle the aim line is drawn, 0 = no line. */
  aimLine: 1,
  aimLineAlpha: 0.5,
  /**
   * Auto lock-on for stick aiming, per device: the shot snaps onto the zombie best matching the
   * stick, and the marker jumps to it. Off = shots go exactly where the stick points.
   */
  lockOnTouch: true,
  lockOnGamepad: true,
  /** Zombies up to this many radians either side of the stick, and this far away (world px), can be locked. */
  lockOnCone: 0.35,
  lockOnRange: 360,
  /** A fresh lock is kept at least this long, seconds, so it can't flicker between two zombies. */
  lockOnHold: 0.2,
  /**
   * Touch only: how far past the arena edge the camera may follow, as a share of the half-screen, so
   * the player stays near the middle and never ends up under a thumb. 1 = dead centre even in a
   * corner; 0 = the desktop camera, which stops at `CAMERA.edgeReveal`.
   */
  touchEdgeReveal: 0.85,
};

// Dev only: edits to this file update the running game in place, no reload (src/debug/hotConfig.ts).
if (import.meta.hot) {
  trackHotConfig(import.meta.hot, { CONTROLS });
  import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
}

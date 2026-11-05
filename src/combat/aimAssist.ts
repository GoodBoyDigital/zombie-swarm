import { CONTROLS } from "../config/controls";
import type { Horde } from "../entities/Horde";

/**
 * Optional help for stick aiming, off unless `CONTROLS.aimAssistStrength` is raised: turn `angle`
 * part of the way toward the nearest zombie inside a cone around it. Returns the angle to aim along.
 */
export function assistAim(
  horde: Horde,
  x: number,
  y: number,
  angle: number,
): number {
  const {
    aimAssistStrength: strength,
    aimAssistCone: cone,
    aimAssistRange: range,
  } = CONTROLS;
  if (strength <= 0) return angle;
  let nearest = range * range;
  let turn = 0;
  horde.hash.queryBox(x - range, y - range, x + range, y + range, (z) => {
    const dx = z.x - x;
    const dy = z.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= nearest) return;
    // Signed angle from the stick to the zombie, wrapped to -PI..PI.
    let off = Math.atan2(dy, dx) - angle;
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2));
    if (Math.abs(off) > cone) return;
    nearest = d2;
    turn = off;
  });
  return angle + turn * Math.min(1, strength);
}

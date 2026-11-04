import type { Audio } from "../audio/Audio";
import { POWERUPS, type Modifiers, type PowerupId } from "../config/powerups";

export interface ActivePowerup {
  id: PowerupId;
  left: number;
}

/**
 * Timed modifiers over the player and weapon. Picking up an active one refreshes its timer;
 * different ones stack by multiplying each field.
 */
export class Powerups {
  readonly active: ActivePowerup[] = [];

  constructor(private readonly audio: Audio) {}

  apply(id: PowerupId): void {
    const seconds = POWERUPS[id].seconds;
    const current = this.active.find((p) => p.id === id);
    if (current) current.left = seconds;
    else this.active.push({ id, left: seconds });
    this.audio.play("powerupPickup", { volume: 0.6 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.left -= dt;
      if (p.left > 0) continue;
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
      this.audio.play("powerupEnd", { volume: 0.5 });
    }
  }

  /** Product of every active power-up's multiplier for one field. */
  scale(field: keyof Modifiers): number {
    let s = 1;
    for (const p of this.active) {
      const mods: Partial<Modifiers> = POWERUPS[p.id].modifiers;
      s *= mods[field] ?? 1;
    }
    return s;
  }
}

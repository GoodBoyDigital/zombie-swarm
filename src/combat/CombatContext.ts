import type { Audio } from "../audio/Audio";
import { rand } from "../core/random";
import type { Horde } from "../entities/Horde";
import type { Zombie } from "../entities/Zombie";
import type { Camera } from "../fx/Camera";
import type { Effects } from "../fx/Effects";
import type { FloorCanvas } from "../world/FloorCanvas";

const BLOOD_SPRAY = 0x6fe04a;

/**
 * Everything that hurts zombies goes through one of these: shot handlers, explosions, power-ups.
 * Anyone with the five systems can build one; each owner keeps its own so sound throttles don't
 * cross (the weapon has one, power-ups another).
 */
export class CombatContext {
  /** Sound throttles: one hit and one death sound per volley, or a shotgun or a blast stacks dozens. */
  hitSoundPlayed = false;
  deathSoundPlayed = false;
  /** Damage multiplier on every applyHit through this context (the weapon's is double damage). */
  damageScale = 1;

  constructor(
    readonly horde: Horde,
    readonly fx: Effects,
    readonly floor: FloorCanvas,
    readonly camera: Camera,
    readonly audio: Audio,
  ) {}

  /** Start a new trigger pull or blast: the next hit and kill may each play their sound again. */
  beginVolley(): void {
    this.hitSoundPlayed = false;
    this.deathSoundPlayed = false;
  }

  /**
   * Resolve one zombie taking a hit: damage, knockback along `dir`, gore and the kill.
   * The one place a zombie takes damage; a blast calls it once per zombie with a direction radiating out.
   */
  applyHit(
    zombie: Zombie,
    hitX: number,
    hitY: number,
    dirX: number,
    dirY: number,
    damage: number,
    knockback: number,
  ): void {
    const killed = zombie.hit(damage * this.damageScale, dirX, dirY, knockback);
    this.fx.bloodBurst(hitX, hitY, dirX, dirY, killed ? 12 : 6, BLOOD_SPRAY);
    this.horde.splat(hitX, hitY, dirX, dirY);
    if (killed) {
      if (!this.deathSoundPlayed)
        this.audio.play("zombieDeath", {
          pitch: rand(0.85, 1.15),
          volume: 0.8,
        });
      this.deathSoundPlayed = true;
      this.horde.kill(zombie);
    } else {
      if (!this.hitSoundPlayed)
        this.audio.play("zombieHit", { pitch: rand(0.9, 1.2), volume: 0.6 });
      this.hitSoundPlayed = true;
    }
  }
}

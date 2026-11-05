import type { Audio } from "../audio/Audio";
import { DISMEMBER } from "../config/dismember";
import { PART_IDS } from "../config/zombies";
import { rand } from "../core/random";
import type { Horde } from "../entities/Horde";
import type { Zombie } from "../entities/Zombie";
import type { Camera } from "../fx/Camera";
import type { Casings } from "../fx/Casings";
import type { Effects } from "../fx/Effects";
import type { FloorCanvas } from "../world/FloorCanvas";

export const BLOOD_SPRAY = 0x6fe04a;

/**
 * Everything that hurts zombies goes through one of these: shot handlers, explosions, power-ups.
 * Anyone with the six systems can build one; each owner keeps its own so sound throttles don't
 * cross (the weapon has one, power-ups another).
 */
export class CombatContext {
  /** Sound throttles: one hit and one death sound per volley, or a shotgun or a blast stacks dozens. */
  hitSoundPlayed = false;
  deathSoundPlayed = false;
  tearSoundPlayed = false;
  /** Damage multiplier on every applyHit through this context (the weapon's comes from power mode). */
  damageScale = 1;
  /** Multiplier on each part's tear-off chance for hits through this context (hypno disc blades raise it). */
  dismemberScale = 1;
  /** Tracer intensity for shots through this context: 1 = normal, higher = thicker and hotter. */
  shotPower = 1;

  constructor(
    readonly horde: Horde,
    readonly fx: Effects,
    readonly floor: FloorCanvas,
    readonly camera: Camera,
    readonly audio: Audio,
    readonly casings: Casings,
  ) {}

  /** Where the last severed piece left the body, for its blood spurt. */
  private readonly stump = { x: 0, y: 0 };

  /** Start a new trigger pull or blast: the next hit and kill may each play their sound again. */
  beginVolley(): void {
    this.horde.volley++;
    this.hitSoundPlayed = false;
    this.deathSoundPlayed = false;
    this.tearSoundPlayed = false;
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
    let killed = zombie.hit(damage * this.damageScale, dirX, dirY, knockback);
    // Before the kill, so the corpse lies down without the piece too.
    const severed = this.dismember(zombie, hitX, hitY, dirX, dirY);
    if (PART_IDS[severed] === "head" && DISMEMBER.headKills && !zombie.dead) {
      zombie.drop();
      killed = true;
    }
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

  /**
   * Maybe tear off the part the hit struck: the piece flies along `dir` and the stump spurts.
   * A head pops off with a bigger burst from the neck. Returns the severed part's bit, or -1.
   */
  private dismember(
    zombie: Zombie,
    hitX: number,
    hitY: number,
    dirX: number,
    dirY: number,
  ): number {
    const bit = zombie.partOnRay(hitX, hitY, dirX, dirY);
    if (
      bit < 0 ||
      Math.random() >= DISMEMBER[`${PART_IDS[bit]}Chance`] * this.dismemberScale
    )
      return -1;
    this.horde.limbs.launch(zombie, bit, dirX, dirY, this.stump);
    zombie.sever(bit);
    const { x, y } = this.stump;
    // One burst at the moment of the tear; a lingering spray would stay put while the body moves on.
    const head = PART_IDS[bit] === "head";
    const sparks = head ? DISMEMBER.headSpurt : DISMEMBER.spurt;
    this.fx.bloodBurst(x, y, dirX, dirY, sparks, BLOOD_SPRAY);
    if (!this.tearSoundPlayed)
      this.audio.play(head ? "zombieHeadPop" : "zombieTear", {
        pitch: rand(0.85, 1.2),
        volume: 0.8,
      });
    this.tearSoundPlayed = true;
    return bit;
  }
}

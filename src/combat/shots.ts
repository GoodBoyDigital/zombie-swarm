import type { Audio } from "../audio/Audio";
import type { WeaponDef } from "../config/weapons";
import { rand } from "../core/random";
import type { Horde } from "../entities/Horde";
import type { Zombie } from "../entities/Zombie";
import type { Effects } from "../fx/Effects";
import type { FloorCanvas } from "../world/FloorCanvas";
import { raycastZombies } from "./raycast";

const BLOOD_SPRAY = 0x6fe04a;

/** Only hitscan exists. Rockets, grenades and flames will each add a handler here. */
export type ShotType = "hitscan";

/** Everything a shot needs to find and hurt zombies. One per Weapon, shared by every handler. */
export class ShotContext {
  /** Sound throttles: one hit and one death sound per trigger pull, or a shotgun stacks eight copies. */
  hitSoundPlayed = false;
  deathSoundPlayed = false;
  /** Power-up damage multiplier. */
  damageScale = 1;

  constructor(
    readonly horde: Horde,
    readonly fx: Effects,
    readonly floor: FloorCanvas,
    readonly audio: Audio,
  ) {}

  /**
   * Resolve one zombie taking a hit: damage, knockback along `dir`, gore and the kill.
   * Every shot type ends here, so a blast calls it once per zombie with a direction radiating from the impact.
   */
  applyHit(
    zombie: Zombie,
    hitX: number,
    hitY: number,
    dirX: number,
    dirY: number,
    def: WeaponDef,
  ): void {
    const killed = zombie.hit(
      def.damage * this.damageScale,
      dirX,
      dirY,
      def.knockback,
    );
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

export interface ShotHandler {
  /** Launch one pellet from the muzzle along a unit direction. Called `def.pellets` times per pull. */
  fire(
    ctx: ShotContext,
    def: WeaponDef,
    ox: number,
    oy: number,
    dirX: number,
    dirY: number,
  ): void;
  /** Projectile types move their bodies and detonate here; instant types leave it out. */
  update?(ctx: ShotContext, dt: number): void;
}

const hitscan: ShotHandler = {
  fire(ctx, def, ox, oy, dirX, dirY) {
    const hits = raycastZombies(
      ctx.horde.hash,
      ox,
      oy,
      dirX,
      dirY,
      def.range,
      def.pierce,
    );
    // The tracer stops at the zombie that absorbed the shot; a piercing shot carries on through.
    const stoppedBy = hits.length >= def.pierce ? hits[hits.length - 1] : null;
    const endX = stoppedBy ? stoppedBy.x : ox + dirX * def.range;
    const endY = stoppedBy ? stoppedBy.y : oy + dirY * def.range;
    ctx.fx.tracer(ox, oy, endX, endY, def.tracerWidth);
    for (const hit of hits)
      ctx.applyHit(hit.zombie, hit.x, hit.y, dirX, dirY, def);
  },
};

export const SHOT_HANDLERS: Record<ShotType, ShotHandler> = { hitscan };

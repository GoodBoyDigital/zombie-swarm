import type { Audio } from "../audio/Audio";
import { WEAPON_NOISE_RADIUS, type WeaponDef } from "../config/weapons";
import { rand } from "../core/random";
import type { Horde } from "../entities/Horde";
import type { Player } from "../entities/Player";
import type { Camera } from "../fx/Camera";
import type { Effects } from "../fx/Effects";
import { raycastZombies } from "./raycast";

const BLOOD_SPRAY = 0x6fe04a;

/** Fires along the player's aim and resolves hits instantly. No projectiles exist. */
export class Weapon {
  private cooldown = 0;

  constructor(
    readonly def: WeaponDef,
    private readonly player: Player,
    private readonly horde: Horde,
    private readonly fx: Effects,
    private readonly camera: Camera,
    private readonly audio: Audio,
  ) {}

  update(dt: number, triggerHeld: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!triggerHeld) return;
    // Carry the overshoot so the rate doesn't quantise to frames; fast weapons may fire twice a frame.
    while (this.cooldown <= 0) {
      this.cooldown += this.def.fireInterval;
      this.fire();
    }
  }

  private fire(): void {
    const { def } = this;
    const angle = this.player.aim + rand(-def.spread, def.spread);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const m = this.player.muzzle();

    const hits = raycastZombies(
      this.horde.hash,
      m.x,
      m.y,
      dirX,
      dirY,
      def.range,
      def.pierce,
    );
    // The tracer stops at the zombie that absorbed the shot; a piercing shot carries on through.
    const stoppedBy = hits.length >= def.pierce ? hits[hits.length - 1] : null;
    const endX = stoppedBy ? stoppedBy.x : m.x + dirX * def.range;
    const endY = stoppedBy ? stoppedBy.y : m.y + dirY * def.range;

    this.audio.play("gunshot", { pitch: rand(0.92, 1.08), volume: 0.7 });
    this.fx.muzzleFlash(m.x, m.y, angle);
    this.fx.tracer(m.x, m.y, endX, endY, def.tracerWidth);
    this.player.recoil(dirX, dirY, def.recoil);
    this.camera.addTrauma(def.shake);
    this.camera.kick(dirX * 3, dirY * 3);
    this.horde.noise(m.x, m.y, def.noiseRadius ?? WEAPON_NOISE_RADIUS);

    for (const hit of hits) {
      const killed = hit.zombie.hit(def.damage, dirX, dirY, def.knockback);
      this.fx.bloodBurst(
        hit.x,
        hit.y,
        dirX,
        dirY,
        killed ? 12 : 6,
        BLOOD_SPRAY,
      );
      this.horde.splat(hit.x, hit.y, dirX, dirY);
      if (killed) {
        this.audio.play("zombieDeath", {
          pitch: rand(0.85, 1.15),
          volume: 0.8,
        });
        this.horde.kill(hit.zombie);
      } else {
        this.audio.play("zombieHit", { pitch: rand(0.9, 1.2), volume: 0.6 });
      }
    }
  }
}

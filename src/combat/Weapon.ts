import type { Audio, SfxName } from "../audio/Audio";
import { WEAPONS, type WeaponDef, type WeaponId } from "../config/weapons";
import { rand } from "../core/random";
import type { Horde } from "../entities/Horde";
import type { Player } from "../entities/Player";
import type { Camera } from "../fx/Camera";
import type { Casings } from "../fx/Casings";
import type { Effects } from "../fx/Effects";
import type { FloorCanvas } from "../world/FloorCanvas";
import { SHOT_HANDLERS, ShotContext } from "./shots";

const SHOT_SFX: Record<WeaponId, SfxName> = {
  pistol: "shotPistol",
  rifle: "shotRifle",
  shotgun: "shotShotgun",
  railgun: "shotRailgun",
  minigun: "shotMinigun",
};

/**
 * The player's gun: fire timing, magazine and reload, plus the feel on each pull. How a pellet
 * reaches zombies is the shot handler's job (see shots.ts).
 * Two states: ready (rounds left in the magazine) and reloading. An empty magazine reloads itself.
 */
export class Weapon {
  id: WeaponId = "rifle";
  rounds = 0;
  /** Seconds left on the current reload, 0 when ready. */
  reloadLeft = 0;
  private cooldown = 0;
  private readonly shots: ShotContext;

  constructor(
    private readonly player: Player,
    horde: Horde,
    fx: Effects,
    floor: FloorCanvas,
    private readonly camera: Camera,
    private readonly audio: Audio,
    private readonly casings: Casings,
  ) {
    this.shots = new ShotContext(horde, fx, floor, audio);
    this.equip(this.id);
  }

  /** Live def, so tuning edits apply to the next shot. */
  get def(): WeaponDef {
    return WEAPONS[this.id];
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  /** Swap to a weapon with a full magazine, dropping any reload in progress. */
  equip(id: WeaponId): void {
    this.id = id;
    this.rounds = this.def.magazine;
    this.reloadLeft = 0;
    this.cooldown = 0;
  }

  reload(): void {
    if (this.reloading || this.rounds >= this.def.magazine) return;
    this.reloadLeft = this.def.reloadSeconds;
    this.audio.play("reload", { pitch: rand(0.95, 1.05), volume: 0.6 });
  }

  update(dt: number, triggerHeld: boolean): void {
    for (const handler of Object.values(SHOT_HANDLERS))
      handler.update?.(this.shots, dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft > 0) return;
      this.reloadLeft = 0;
      this.rounds = this.def.magazine;
    }
    if (!triggerHeld) return;
    // Carry the overshoot so the rate doesn't quantise to frames; fast weapons may fire twice a frame.
    while (this.cooldown <= 0 && this.rounds > 0) {
      this.cooldown += this.def.fireInterval;
      this.rounds--;
      this.fire();
    }
    if (this.rounds === 0) this.reload();
  }

  private fire(): void {
    const { def } = this;
    const m = this.player.muzzle();
    const aim = this.player.aim;
    const aimX = Math.cos(aim);
    const aimY = Math.sin(aim);

    this.audio.play(SHOT_SFX[this.id], {
      pitch: rand(0.92, 1.08),
      volume: 0.7,
    });
    this.shots.fx.muzzleFlash(m.x, m.y, aim);
    this.player.recoil(aimX, aimY, def.recoil);
    if (def.casing) {
      // Port sits a little way up the barrel from the body, not at the muzzle.
      const port = 14;
      this.casings.eject(
        this.player.x + aimX * port,
        this.player.y + aimY * port,
        aim,
        def.casing,
      );
    }
    this.camera.addTrauma(def.shake);
    this.camera.kick(aimX * 3, aimY * 3);

    this.shots.hitSoundPlayed = false;
    this.shots.deathSoundPlayed = false;
    const handler = SHOT_HANDLERS[def.shot];
    for (let i = 0; i < def.pellets; i++) {
      const a = aim + rand(-def.spread, def.spread);
      handler.fire(this.shots, def, m.x, m.y, Math.cos(a), Math.sin(a));
    }
  }
}

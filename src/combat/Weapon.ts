import type { Audio, SfxName } from "../audio/Audio";
import {
  BACKUP_WEAPON,
  WEAPON_NOISE_RADIUS,
  WEAPONS,
  type WeaponDef,
  type WeaponId,
} from "../config/weapons";
import { rand } from "../core/random";
import type { Horde } from "../entities/Horde";
import type { Player } from "../entities/Player";
import type { Camera } from "../fx/Camera";
import type { Casings } from "../fx/Casings";
import type { Effects } from "../fx/Effects";
import type { FloorCanvas } from "../world/FloorCanvas";
import { CombatContext } from "./CombatContext";
import { SHOT_HANDLERS } from "./shots";

const SHOT_SFX: Record<WeaponId, SfxName> = {
  pistol: "shotPistol",
  rifle: "shotRifle",
  shotgun: "shotShotgun",
  railgun: "shotRailgun",
  minigun: "shotMinigun",
  magnum: "shotMagnum",
  uzi: "shotUzi",
  rocket: "rocketLaunch",
};

/** Spin-down takes this many times longer than spin-up. */
const SPIN_DOWN = 2.5;

/**
 * The player's gun: fire timing, magazine and reload, plus the feel on each pull. How a pellet
 * reaches zombies is the shot handler's job (see shots.ts).
 * Two states: ready (rounds left in the magazine) and reloading. An empty magazine reloads itself.
 */
export class Weapon {
  id: WeaponId = BACKUP_WEAPON;
  rounds = 0;
  /** Magazines left after the loaded one. Infinity for the pistol. */
  spareMagazines = Infinity;
  /** Seconds left on the current reload, 0 when ready. */
  reloadLeft = 0;
  private cooldown = 0;
  /** Extra spread built up by holding the trigger. See WeaponDef.spreadBloom. */
  bloom = 0;
  /** Barrel wind-up, 0 at rest to 1 at full speed, for weapons with `spinUp`. Others sit at 1. */
  spin = 1;
  /** Trigger held with the barrels driven this frame (not while reloading or empty). */
  private spinHeld = false;
  /** Power-up multipliers, set each frame by the game. Damage lives on the shot context. */
  fireIntervalScale = 1;
  spreadScale = 1;
  /** Power-up multiplier on reload time. */
  reloadScale = 1;
  private readonly shots: CombatContext;

  constructor(
    private readonly player: Player,
    horde: Horde,
    fx: Effects,
    floor: FloorCanvas,
    private readonly camera: Camera,
    private readonly audio: Audio,
    private readonly casings: Casings,
  ) {
    this.shots = new CombatContext(horde, fx, floor, camera, audio, casings);
    this.equip(this.id);
  }

  /** Live def, so tuning edits apply to the next shot. */
  get def(): WeaponDef {
    return WEAPONS[this.id];
  }

  /** Seconds a full reload takes right now, power-ups included. */
  get reloadDuration(): number {
    return this.def.reloadSeconds * this.reloadScale;
  }

  /** Tracer intensity from power-ups; 1 = normal. */
  set shotPower(power: number) {
    this.shots.shotPower = power;
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  /** Swap to a weapon with a full magazine and its pickup's spares, dropping any reload in progress. */
  equip(id: WeaponId): void {
    this.id = id;
    this.player.equip(this.def);
    this.rounds = this.def.magazine;
    this.spareMagazines = this.def.magazines - 1;
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.spin = this.def.spinUp ? 0 : 1;
    this.player.barrelSpin = 0;
  }


  /** Current half-angle of spread, base plus bloom. */
  get spread(): number {
    return (
      Math.min(this.def.spreadMax, this.def.spread + this.bloom) *
      this.spreadScale
    );
  }

  set damageScale(scale: number) {
    this.shots.damageScale = scale;
  }

  reload(): void {
    if (this.reloading || this.rounds >= this.def.magazine) return;
    if (this.spareMagazines <= 0) {
      // Dry: out of a pickup's ammo, back to the backup gun. A partly full last magazine keeps firing.
      if (this.rounds === 0) this.outOfAmmo();
      return;
    }
    this.spareMagazines--;
    this.reloadLeft = this.reloadDuration;
    this.audio.play("reload", { pitch: rand(0.95, 1.05), volume: 0.6 });
  }

  update(dt: number, triggerHeld: boolean): void {
    for (const handler of Object.values(SHOT_HANDLERS))
      handler.update?.(this.shots, dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const firing = triggerHeld && !this.reloading && this.rounds > 0;
    const { spreadBloom, spreadMax, spread } = this.def;
    this.bloom = firing
      ? Math.min(Math.max(0, spreadMax - spread), this.bloom + spreadBloom * dt)
      : Math.max(0, this.bloom - spreadBloom * 2 * dt);
    const ready = this.windUp(dt, triggerHeld && !this.reloading);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft > 0) return;
      this.reloadLeft = 0;
      this.rounds = this.def.magazine;
    }
    if (!ready || !triggerHeld) return;
    // Carry the overshoot so the rate doesn't quantise to frames; fast weapons may fire twice a frame.
    while (this.cooldown <= 0 && this.rounds > 0) {
      this.cooldown += this.def.fireInterval * this.fireIntervalScale;
      this.rounds--;
      this.fire();
    }
    if (this.rounds === 0) this.reload();
  }

  /**
   * Spin the barrels up while the trigger is held, and down (slower) when it isn't, so short taps
   * stay ready. Returns whether the barrels are at speed; weapons without `spinUp` always are.
   */
  private windUp(dt: number, driven: boolean): boolean {
    const { spinUp } = this.def;
    if (!spinUp) return true;
    const wasHeld = this.spinHeld;
    this.spinHeld = driven && this.rounds > 0;
    if (this.spinHeld && !wasHeld && this.spin < 1)
      this.audio.play("minigunSpinUp", {
        pitch: rand(0.95, 1.05),
        volume: 0.6,
      });
    this.spin = this.spinHeld
      ? Math.min(1, this.spin + dt / spinUp)
      : Math.max(0, this.spin - dt / (spinUp * SPIN_DOWN));
    // No banked shots while winding up, or the first frame at speed fires a burst.
    if (this.spin < 1) this.cooldown = 0;
    this.player.barrelSpin = this.spin;
    return this.spin >= 1;
  }

  /** The pickup is spent: back to the pistol, which never runs out. */
  private outOfAmmo(): void {
    this.audio.play("reload", { pitch: 0.7, volume: 0.6 });
    this.equip(BACKUP_WEAPON);
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
    // Recoil first so the flash spawns at the kicked-back tip it will be drawn against.
    this.player.recoil(aimX, aimY, def.recoil, def.gunKick);
    if (!def.beam) this.shots.fx.muzzleFlash(this.player);
    if (def.casing) {
      const port = this.player.ejectPort();
      this.casings.eject(port.x, port.y, aim, def.casing);
    }
    this.camera.addTrauma(def.shake);
    const kick = def.cameraKick ?? 3;
    this.camera.kick(aimX * kick, aimY * kick);
    this.shots.horde.noise(m.x, m.y, def.noiseRadius ?? WEAPON_NOISE_RADIUS);

    this.shots.beginVolley();
    const handler = SHOT_HANDLERS[def.shot];
    const spread = this.spread;
    for (let i = 0; i < def.pellets; i++) {
      const a = aim + rand(-spread, spread);
      handler.fire(this.shots, def, m.x, m.y, Math.cos(a), Math.sin(a));
    }
  }
}

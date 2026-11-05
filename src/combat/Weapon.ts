import type { Audio, LoopVoice, SfxName } from "../audio/Audio";
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
import { HeadGlow } from "../fx/HeadGlow";
import type { FloorCanvas } from "../world/FloorCanvas";
import { CombatContext } from "./CombatContext";
import { SHOT_HANDLERS } from "./shots";

/** Played on every trigger pull; null for guns whose sound is an engine loop. */
const SHOT_SFX: Record<WeaponId, SfxName | null> = {
  pistol: "shotPistol",
  rifle: "shotRifle",
  shotgun: "shotShotgun",
  railgun: "shotRailgun",
  minigun: "shotMinigun",
  magnum: "shotMagnum",
  uzi: "shotUzi",
  rocket: "rocketLaunch",
  tesla: "shotTesla",
  chainsaw: null,
  sonic: "shotSonic",
};

/** Played when a spin-up gun starts winding up from rest. */
const SPIN_SFX: Partial<Record<WeaponId, SfxName>> = {
  minigun: "minigunSpinUp",
  chainsaw: "chainsawRev",
};

/** Guns with a running engine: an idle loop while held, crossfading to the run loop as it spins up. */
const ENGINE_SFX: Partial<Record<WeaponId, { idle: SfxName; run: SfxName }>> = {
  chainsaw: { idle: "chainsawIdle", run: "chainsawCut" },
};
const ENGINE_VOLUME = 0.55;
/** An engine gun never sits fully still: its spin reads at least this, so it putters and buzzes at idle. */
const ENGINE_IDLE_SPIN = 0.18;

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
  private engine: { id: WeaponId; idle: LoopVoice; run: LoopVoice } | null =
    null;
  /** The tesla's lit emitter; made on first use, hidden for every other gun. */
  private head: HeadGlow | null = null;
  /** World seconds to the chainsaw's next exhaust puff. */
  private smokeLeft = 0;

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

  /** Player move speed multiplier from the gun: a chainsaw bogs him down while it runs. */
  get moveScale(): number {
    return this.spinHeld && this.def.saw ? this.def.saw.moveScale : 1;
  }

  /** Stop any engine loop and put out the gun's glow, e.g. when the player is down or aboard, or the game is torn down. */
  silence(): void {
    this.engine?.idle.stop();
    this.engine?.run.stop();
    this.engine = null;
    this.head?.hide();
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

  /** Projectiles in flight and engine exhaust. Called on world time, so both slow with the world. */
  updateShots(dt: number): void {
    for (const handler of Object.values(SHOT_HANDLERS))
      handler.update?.(this.shots, dt);
    this.exhaust(dt);
  }

  /**
   * Chuck, chuck, chuck: a chainsaw puffs two-stroke smoke out of the side of its engine, slow and
   * light at idle, fast, big and dark flat out. The puffs stay where they left the exhaust.
   */
  private exhaust(dt: number): void {
    const s = this.def.saw;
    if (!s) return;
    this.smokeLeft -= dt;
    if (this.smokeLeft > 0) return;
    const k = this.spin;
    const mix = (idle: number, cut: number) => idle + (cut - idle) * k;
    this.smokeLeft += mix(s.smokeInterval, s.smokeCutInterval);
    // A long frame or a fresh pickup must not dump a backlog of puffs.
    this.smokeLeft = Math.max(this.smokeLeft, 0);
    const { aim } = this.player;
    const port = this.player.ejectPort();
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    // Out of the housing's side (the sprite's +y), angled a little back.
    const kick = mix(s.smokeKick, s.smokeCutKick);
    const sx = -sin * 0.92 - cos * 0.4;
    const sy = cos * 0.92 - sin * 0.4;
    const size = mix(s.smokeSize, s.smokeCutSize) * rand(0.8, 1.2);
    this.shots.fx.puff(
      port.x,
      port.y,
      sx * kick * rand(0.8, 1.2),
      sy * kick * rand(0.8, 1.2),
      size,
      size * s.smokeGrow,
      mixColor(s.smokeColor, s.smokeCutColor, k),
      mix(s.smokeAlpha, s.smokeCutAlpha),
      s.smokeLife * rand(0.85, 1.15),
    );
  }

  /** Fire timing and reloads, on real time. */
  update(dt: number, triggerHeld: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const firing = triggerHeld && !this.reloading && this.rounds > 0;
    const { spreadBloom, spreadMax, spread } = this.def;
    this.bloom = firing
      ? Math.min(Math.max(0, spreadMax - spread), this.bloom + spreadBloom * dt)
      : Math.max(0, this.bloom - spreadBloom * 2 * dt);
    const ready = this.windUp(dt, triggerHeld && !this.reloading);
    this.runEngine();
    this.glowHead(dt, firing);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft > 0) return;
      this.reloadLeft = 0;
      this.rounds = this.def.magazine;
    }
    if (!ready || !triggerHeld) return;
    // Carry the overshoot so the rate doesn't quantise to frames; fast weapons may fire twice a frame.
    while (this.cooldown <= 0 && this.rounds > 0) {
      const interval = this.def.fireInterval * this.fireIntervalScale;
      this.cooldown += interval;
      // Fuel burns by the second; everything else spends a round.
      this.rounds = Math.max(0, this.rounds - (this.def.fuel ? interval : 1));
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
    const spinSfx = SPIN_SFX[this.id];
    if (spinSfx && this.spinHeld && !wasHeld && this.spin < 1)
      this.audio.play(spinSfx, { pitch: rand(0.95, 1.05), volume: 0.6 });
    this.spin = this.spinHeld
      ? Math.min(1, this.spin + dt / spinUp)
      : Math.max(0, this.spin - dt / (spinUp * SPIN_DOWN));
    // No banked shots while winding up, or the first frame at speed fires a burst.
    if (this.spin < 1) this.cooldown = 0;
    this.player.barrelSpin = ENGINE_SFX[this.id]
      ? Math.max(ENGINE_IDLE_SPIN, this.spin)
      : this.spin;
    return this.spin >= 1;
  }

  /** Light the tesla's emitter head while it's held, hotter while firing. */
  private glowHead(dt: number, firing: boolean): void {
    const t = this.def.tesla;
    if (!t) {
      this.head?.hide();
      return;
    }
    if (!this.head) {
      this.head = new HeadGlow(this.shots.fx);
      this.shots.fx.view.addChild(this.head.view);
    }
    this.head.update(dt, this.player, firing, t);
  }

  /** Keep an engine gun's loops running while it's held, mixed by how hard it's revving. */
  private runEngine(): void {
    if (this.engine && this.engine.id !== this.id) this.silence();
    const sfx = ENGINE_SFX[this.id];
    if (!sfx) return;
    this.engine ??= {
      id: this.id,
      idle: this.audio.loopVoice(sfx.idle, 0),
      run: this.audio.loopVoice(sfx.run, 0),
    };
    this.engine.idle.volume(ENGINE_VOLUME * (1 - this.spin));
    this.engine.run.volume(ENGINE_VOLUME * this.spin);
  }

  /** The pickup is spent: back to the pistol, which never runs out. */
  private outOfAmmo(): void {
    this.audio.play("reload", { pitch: 0.7, volume: 0.6 });
    this.equip(BACKUP_WEAPON);
  }

  private fire(): void {
    const { def } = this;
    const aim = this.player.aim;
    const aimX = Math.cos(aim);
    const aimY = Math.sin(aim);

    const sfx = SHOT_SFX[this.id];
    if (sfx) this.audio.play(sfx, { pitch: rand(0.92, 1.08), volume: 0.7 });
    const handler = SHOT_HANDLERS[def.shot];
    // Apply the visible kick before sampling the shared origin for the shot and flash.
    this.player.recoil(aimX, aimY, def.recoil, def.gunKick);
    const m = this.player.muzzle();
    const o = handler.fromBody ? this.player : m;
    if (!def.beam && !handler.ownMuzzle) this.shots.fx.muzzleFlash(this.player);
    if (def.casing) {
      const port = this.player.ejectPort();
      this.casings.eject(port.x, port.y, aim, def.casing);
    }
    this.camera.addTrauma(def.shake);
    const kick = def.cameraKick ?? 3;
    this.camera.kick(aimX * kick, aimY * kick);
    this.shots.horde.noise(m.x, m.y, def.noiseRadius ?? WEAPON_NOISE_RADIUS);

    this.head?.shot();
    this.shots.beginVolley();
    this.shots.dismemberScale = def.dismemberScale ?? 1;
    const spread = this.spread;
    for (let i = 0; i < def.pellets; i++) {
      const a = aim + rand(-spread, spread);
      handler.fire(this.shots, def, o.x, o.y, Math.cos(a), Math.sin(a));
    }
    // Rockets and waves already in flight carry their own rate.
    this.shots.dismemberScale = 1;
  }
}

/** Blend two colours channel by channel, `t` 0 = a, 1 = b. */
function mixColor(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

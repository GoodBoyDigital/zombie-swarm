import { Container, Sprite } from "pixi.js";
import type { TeslaParams } from "../config/weapons";
import { rand } from "../core/random";
import type { Effects, MuzzleSource } from "./Effects";
import { BLAST_TEXTURE_RADIUS } from "./textures";

/** The glow sits this far back from the muzzle, px, so it wraps the emitter between the prongs. */
const HEAD_BACK = 4;
/** Prong tips either side of the barrel line, px; idle sparks jump between them. */
const PRONG_HALF = 4.5;
/** How fast a shot's pulse dies away, per second, and how much it swells the glow. */
const PULSE_DECAY = 22;
const PULSE_SWELL = 0.35;
/** Breathing at rest: radians per second and depth; flicker depth on top. */
const BREATHE_SPEED = 5;
const BREATHE = 0.12;
const FLICKER = 0.12;

/**
 * The tesla's emitter head lit up: a soft additive halo with a white-hot core, pinned to the muzzle
 * every frame so it rides the kick and the aim. Breathes at rest with the odd spark between the
 * prongs; ramps up hard while firing, pulsing with each shot, and back down after release.
 */
export class HeadGlow {
  readonly view = new Container({ label: "teslaHead" });
  private readonly halo: Sprite;
  private readonly core: Sprite;
  /** 0 at rest, 1 flat out. */
  private heat = 0;
  /** Swell from the last shot, 1 at the shot, dying away. */
  private pulse = 0;
  private age = 0;

  constructor(private readonly fx: Effects) {
    const glow = (label: string) =>
      new Sprite({
        texture: fx.tex.blast.glow,
        anchor: 0.5,
        blendMode: "add",
        label,
      });
    this.halo = glow("teslaHeadHalo");
    this.core = glow("teslaHeadCore");
    this.core.tint = 0xffffff;
    this.view.addChild(this.halo, this.core);
    this.view.visible = false;
  }

  /** A shot just left the prongs. */
  shot(): void {
    this.pulse = 1;
  }

  hide(): void {
    this.view.visible = false;
    this.heat = 0;
    this.pulse = 0;
  }

  update(
    dt: number,
    source: MuzzleSource,
    firing: boolean,
    t: TeslaParams,
  ): void {
    this.view.visible = true;
    this.age += dt;
    this.heat = firing
      ? Math.min(1, this.heat + dt / t.glowRampUp)
      : Math.max(0, this.heat - dt / t.glowRampDown);
    this.pulse *= Math.exp(-dt * PULSE_DECAY);
    const h = this.heat;
    const m = source.muzzle();
    const cos = Math.cos(source.aim);
    const sin = Math.sin(source.aim);
    const x = m.x - cos * HEAD_BACK;
    const y = m.y - sin * HEAD_BACK;
    this.view.position.set(x, y);

    const breathe = 1 + BREATHE * Math.sin(this.age * BREATHE_SPEED);
    const flicker = 1 + rand(-FLICKER, FLICKER) * (0.5 + h);
    const size =
      (t.glowSize / BLAST_TEXTURE_RADIUS) *
      (1 + (t.glowFiringScale - 1) * h) *
      (1 + PULSE_SWELL * this.pulse) *
      breathe;
    this.halo.scale.set(size * flicker);
    this.halo.tint = t.glowColor;
    this.halo.alpha = Math.min(
      1,
      (t.glowIdle + (t.glowFiring - t.glowIdle) * h + 0.3 * this.pulse) *
        flicker,
    );
    // White-hot core: barely there at rest, blazing when firing.
    this.core.scale.set(size * 0.4 * flicker);
    this.core.alpha = Math.min(
      1,
      (0.25 + 0.75 * h + 0.4 * this.pulse) * flicker,
    );

    const sparks = t.idleSparks + (t.firingSparks - t.idleSparks) * h;
    if (Math.random() < sparks * dt) {
      // Prong tip to prong tip, bowing out ahead of the head.
      const px = -sin * PRONG_HALF;
      const py = cos * PRONG_HALF;
      this.fx.zap(m.x + px, m.y + py, m.x - px, m.y - py, t.glowColor, {
        width: 1 + h,
        life: 0.05,
        jitter: 3,
      });
    }
  }
}

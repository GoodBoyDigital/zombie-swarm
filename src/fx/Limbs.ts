import { Container, Sprite } from "pixi.js";
import { DISMEMBER } from "../config/dismember";
import { pick, rand } from "../core/random";
import type { Zombie } from "../entities/Zombie";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { GameTextures } from "./textures";

/** Apparent growth per px of height so a piece in the air reads as closer to the camera. */
const HEIGHT_SCALE = 0.012;
/** Below this vertical speed a bounce counts as landed. */
const MIN_HOP = 40;
/** Below this horizontal speed, on the floor, the piece is stamped and recycled. */
const REST_SPEED = 8;
/** Pieces leave from a little above the floor: they were on a standing body. */
const START_HEIGHT = 10;
const BLOOD_DARK = 0x3f9a28;

interface Limb {
  sprite: Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  scale: number;
  tint: number;
  landed: boolean;
}

/**
 * Arms and skull pieces shot off zombies. Each tumbles away along the shot, bounces a couple of
 * times, leaves a splat where it first lands, then is burned into the floor and recycled.
 */
export class Limbs {
  readonly view = new Container();
  private readonly live: Limb[] = [];
  private readonly pool: Limb[] = [];

  constructor(
    private readonly tex: GameTextures,
    private readonly floor: FloorCanvas,
  ) {
    this.view.isRenderGroup = true;
  }

  /**
   * Throw part `bit` off zombie `z` from where it sits on the body, along the shot plus some of the
   * zombie's knockback. Writes the piece's start position to `out` for the blood spurt; `z` is not changed.
   */
  launch(
    z: Zombie,
    bit: number,
    dirX: number,
    dirY: number,
    out: { x: number; y: number },
  ): void {
    const part = this.tex.zombies[z.def.art.key].parts[bit];
    if (!part) return;
    if (this.live.length >= DISMEMBER.maxLive) this.settle(0);
    const l = this.pool.pop() ?? this.create();
    const s = z.sprite;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    const lx = (part.x - s.anchor.x * s.texture.width) * s.scale.x;
    const ly = (part.y - s.anchor.y * s.texture.height) * s.scale.y;
    l.x = s.x + lx * cos - ly * sin;
    l.y = s.y + lx * sin + ly * cos;
    l.z = START_HEIGHT;
    const a = Math.atan2(dirY, dirX) + rand(-1, 1) * DISMEMBER.launchSpread;
    const speed = rand(DISMEMBER.launchSpeedMin, DISMEMBER.launchSpeedMax);
    l.vx = Math.cos(a) * speed + z.kx * DISMEMBER.inheritKnockback;
    l.vy = Math.sin(a) * speed + z.ky * DISMEMBER.inheritKnockback;
    l.vz = rand(DISMEMBER.hopMin, DISMEMBER.hopMax);
    l.spin =
      rand(DISMEMBER.spinMin, DISMEMBER.spinMax) *
      (Math.random() < 0.5 ? -1 : 1);
    l.scale = (s.scale.x + s.scale.y) / 2;
    l.tint = z.tint;
    l.landed = false;
    l.sprite.texture = part.texture;
    l.sprite.rotation = s.rotation;
    l.sprite.tint = z.tint;
    l.sprite.position.set(l.x, l.y);
    l.sprite.scale.set(l.scale);
    this.view.addChild(l.sprite);
    this.live.push(l);
    out.x = l.x;
    out.y = l.y;
  }

  update(dt: number): void {
    const d = DISMEMBER;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.sprite.rotation += l.spin * dt;

      if (l.z > 0 || l.vz > 0) {
        l.vz -= d.gravity * dt;
        l.z += l.vz * dt;
        if (l.z <= 0) {
          l.z = 0;
          l.vz = -l.vz * d.bounce;
          l.vx *= d.bounceFriction;
          l.vy *= d.bounceFriction;
          l.spin *= d.bounceFriction;
          if (l.vz < MIN_HOP) l.vz = 0;
          if (!l.landed) this.splat(l);
          l.landed = true;
        }
      } else {
        const drag = Math.exp(-dt * d.floorDrag);
        l.vx *= drag;
        l.vy *= drag;
        l.spin *= drag;
        if (l.vx * l.vx + l.vy * l.vy < REST_SPEED * REST_SPEED) {
          this.settle(i);
          continue;
        }
      }
      l.sprite.position.set(l.x, l.y);
      l.sprite.scale.set(l.scale * (1 + l.z * HEIGHT_SCALE));
    }
  }

  /** A small pool where the piece first hits the ground. */
  private splat(l: Limb): void {
    this.floor.stampTexture(pick(this.tex.splats), l.x, l.y, {
      rotation: rand(0, Math.PI * 2),
      scale: rand(0.4, 0.65),
      tint: BLOOD_DARK,
      alpha: 0.85,
    });
  }

  /** Burn the piece into the floor where it lies and recycle the sprite. */
  private settle(index: number): void {
    const l = this.live[index];
    this.floor.stampTexture(l.sprite.texture, l.x, l.y, {
      rotation: l.sprite.rotation,
      scale: l.scale,
      tint: l.tint,
    });
    this.view.removeChild(l.sprite);
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
    this.pool.push(l);
  }

  private create(): Limb {
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    return {
      sprite,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      scale: 1,
      tint: 0xffffff,
      landed: false,
    };
  }
}

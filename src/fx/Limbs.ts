import { Container, Sprite, type Texture } from "pixi.js";
import { DISMEMBER } from "../config/dismember";
import { ICE } from "../config/ice";
import { PART_IDS } from "../config/zombies";
import { pick, rand } from "../core/random";
import type { Zombie } from "../entities/Zombie";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { GameTextures } from "./textures";

/** Apparent growth per px of height so a piece in the air reads as closer to the camera. */
const HEIGHT_SCALE = 0.012;
/** Most it grows at the top of a hop; a head's high pop would otherwise blow the art up soft. */
const MAX_HEIGHT_GROWTH = 0.3;
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
  /** Leaves a blood splat where it first lands; frozen pieces and ice don't. */
  bleeds: boolean;
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
   * A `frozen` piece (off a shattered zombie) is tinted icy and doesn't bleed where it lands.
   */
  launch(
    z: Zombie,
    bit: number,
    dirX: number,
    dirY: number,
    out: { x: number; y: number },
    frozen = false,
  ): void {
    const part = this.tex.zombies[z.def.art.key].parts[bit];
    if (!part) return;
    const l = this.next();
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
    const head = PART_IDS[bit] === "head";
    l.vz =
      rand(DISMEMBER.hopMin, DISMEMBER.hopMax) *
      (head ? DISMEMBER.headHopScale : 1);
    l.spin =
      rand(DISMEMBER.spinMin, DISMEMBER.spinMax) *
      (head ? DISMEMBER.headSpinScale : 1) *
      (Math.random() < 0.5 ? -1 : 1);
    l.scale =
      ((s.scale.x + s.scale.y) / 2) * DISMEMBER.pieceScale * (head ? 0.7 : 1);
    l.tint = frozen ? ICE.limbTint : z.tint;
    l.landed = false;
    l.bleeds = !frozen;
    l.sprite.texture = pick(part.textures);
    l.sprite.rotation = s.rotation + part.rotation;
    l.sprite.tint = l.tint;
    l.sprite.position.set(l.x, l.y);
    l.sprite.scale.set(l.scale);
    out.x = l.x;
    out.y = l.y;
  }

  /** Throw a loose piece (a chunk of ice) from (x, y) at `angle`; it hops, skids and settles like a limb. */
  toss(
    texture: Texture,
    x: number,
    y: number,
    angle: number,
    speed: number,
    scale: number,
  ): void {
    const d = DISMEMBER;
    const l = this.next();
    l.x = x;
    l.y = y;
    l.z = START_HEIGHT;
    l.vx = Math.cos(angle) * speed;
    l.vy = Math.sin(angle) * speed;
    l.vz = rand(d.hopMin, d.hopMax) * 0.7;
    l.spin = rand(d.spinMin, d.spinMax) * (Math.random() < 0.5 ? -1 : 1);
    l.scale = scale;
    l.tint = 0xffffff;
    l.landed = false;
    l.bleeds = false;
    l.sprite.texture = texture;
    l.sprite.rotation = rand(0, Math.PI * 2);
    l.sprite.tint = l.tint;
    l.sprite.position.set(x, y);
    l.sprite.scale.set(scale);
  }

  /** A live piece to fill in, making room by settling the oldest if too many are flying. */
  private next(): Limb {
    if (this.live.length >= DISMEMBER.maxLive) this.settle(0);
    const l = this.pool.pop() ?? this.create();
    this.view.addChild(l.sprite);
    this.live.push(l);
    return l;
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
          if (!l.landed && l.bleeds) this.splat(l);
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
      l.sprite.scale.set(
        l.scale * (1 + Math.min(MAX_HEIGHT_GROWTH, l.z * HEIGHT_SCALE)),
      );
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
      bleeds: true,
    };
  }
}

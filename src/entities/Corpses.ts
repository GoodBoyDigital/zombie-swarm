import { Container, Sprite, type Texture } from "pixi.js";
import { KNOCKBACK_DRAG, ZOMBIE_SPRITE_RADIUS } from "../config/zombies";
import { pick, rand } from "../core/random";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { GameTextures } from "../fx/textures";

/** Velocity below which a body is considered at rest and gets stamped into the floor. */
const REST_SPEED = 10;
/** Exponential drag on the spin, per second. */
const SPIN_DRAG = 3;
/** Distance travelled between blood smears left behind a sliding body. */
const SMEAR_SPACING = 12;
const BLOOD_DARK = 0x3f9a28;

interface Corpse {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  scale: number;
  tint: number;
  sinceSmear: number;
}

/**
 * Bodies in motion. A killed zombie keeps its knockback, skids to a stop with a slow spin, smears
 * the floor as it goes, then is burned into the floor texture and recycled.
 */
export class Corpses {
  readonly view = new Container();
  private readonly live: Corpse[] = [];
  private readonly pool: Corpse[] = [];

  constructor(
    private readonly tex: GameTextures,
    private readonly floor: FloorCanvas,
  ) {
    this.view.isRenderGroup = true;
  }

  spawn(
    x: number,
    y: number,
    facing: number,
    vx: number,
    vy: number,
    radius: number,
    tint: number,
  ): void {
    const c = this.pool.pop() ?? this.create(this.tex.zombieCorpse);
    c.x = x;
    c.y = y;
    // The body carries exactly the knockback the killing shot gave it; nothing extra.
    c.vx = vx;
    c.vy = vy;
    c.spin = rand(1.5, 4) * (Math.random() < 0.5 ? -1 : 1);
    c.scale = radius / ZOMBIE_SPRITE_RADIUS;
    c.tint = tint;
    c.sinceSmear = 0;
    c.sprite.position.set(x, y);
    c.sprite.rotation = facing + rand(-0.4, 0.4);
    c.sprite.scale.set(c.scale);
    c.sprite.tint = tint;
    this.view.addChild(c.sprite);
    this.live.push(c);
    // The pool marks where it dropped; the body skids away from it.
    this.floor.stampTexture(pick(this.tex.splats), x, y, {
      rotation: rand(0, Math.PI * 2),
      scale: rand(1.1, 1.6),
      tint: BLOOD_DARK,
      alpha: 0.9,
    });
  }

  update(dt: number): void {
    const drag = Math.exp(-dt * KNOCKBACK_DRAG);
    const spinDrag = Math.exp(-dt * SPIN_DRAG);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      const stepX = c.vx * dt;
      const stepY = c.vy * dt;
      c.x += stepX;
      c.y += stepY;
      c.vx *= drag;
      c.vy *= drag;
      c.spin *= spinDrag;
      c.sprite.position.set(c.x, c.y);
      c.sprite.rotation += c.spin * dt;

      c.sinceSmear += Math.hypot(stepX, stepY);
      if (c.sinceSmear >= SMEAR_SPACING) {
        c.sinceSmear = 0;
        this.smear(c);
      }
      if (c.vx * c.vx + c.vy * c.vy < REST_SPEED * REST_SPEED) this.settle(i);
    }
  }

  /** A thin streak of blood under the body, aligned with its travel. */
  private smear(c: Corpse): void {
    this.floor.stampTexture(pick(this.tex.splats), c.x, c.y, {
      rotation: Math.atan2(c.vy, c.vx),
      scaleX: rand(0.5, 0.9),
      scaleY: rand(0.15, 0.3),
      tint: BLOOD_DARK,
      alpha: 0.6,
    });
  }

  /** Burn the resting body into the floor, then recycle the sprite. */
  private settle(index: number): void {
    const c = this.live[index];
    this.floor.stampTexture(this.tex.zombieCorpse, c.x, c.y, {
      rotation: c.sprite.rotation,
      scale: c.scale,
      tint: c.tint,
    });
    this.view.removeChild(c.sprite);
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
    this.pool.push(c);
  }

  private create(texture: Texture): Corpse {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    return {
      sprite,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      spin: 0,
      scale: 1,
      tint: 0xffffff,
      sinceSmear: 0,
    };
  }
}

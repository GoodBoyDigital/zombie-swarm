import { Container, Sprite } from "pixi.js";
import { type CasingId } from "../config/casings";
import { rand } from "../core/random";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { GameTextures } from "./textures";

/** Shells darken a touch once they settle into the floor, so piles read as old mess, not fresh brass. */
const SETTLED_TINT = 0xb0b0b0;

/** Fake vertical physics: casings pop up, fall under gravity and bounce before they settle. */
const GRAVITY = 900;
const BOUNCE = 0.45;
/** Horizontal speed kept after each bounce. */
const BOUNCE_FRICTION = 0.6;
/** Spin kept after each bounce. */
const BOUNCE_SPIN = 0.5;
/** Horizontal drag while skating on the floor, per second. */
const FLOOR_DRAG = 6;
/** Below this horizontal speed, on the floor, the casing is stamped and recycled. */
const REST_SPEED = 8;
/** Apparent growth per px of height so a casing in the air reads as closer to the camera. */
const HEIGHT_SCALE = 0.02;
/** Oldest casings are stamped early if more than this are in flight at once. */
const MAX_LIVE = 200;

interface Casing {
  sprite: Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  bounces: number;
}

/**
 * Spent shells. Each ejects from the gun, tumbles through a couple of bounces, then burns into
 * the floor texture and goes back to the pool. The floor keeps every shell ever fired for free.
 */
export class Casings {
  readonly view = new Container();
  private readonly live: Casing[] = [];
  private readonly pool: Casing[] = [];

  constructor(
    private readonly tex: GameTextures,
    private readonly floor: FloorCanvas,
  ) {
    this.view.isRenderGroup = true;
  }

  /** Throw a shell out of the ejection port, sideways to the aim with a bit of backward drift. */
  eject(x: number, y: number, aim: number, kind: CasingId): void {
    if (this.live.length >= MAX_LIVE) this.settle(0);
    const c = this.pool.pop() ?? this.create();
    c.sprite.texture = this.tex.casings[kind];
    // Ejection port is on the right of the barrel, so throw at aim + 90 degrees, angled slightly back.
    const a = aim + Math.PI / 2 + rand(0.2, 0.6);
    const speed = rand(90, 170);
    c.x = x;
    c.y = y;
    c.z = 6;
    c.vx = Math.cos(a) * speed;
    c.vy = Math.sin(a) * speed;
    c.vz = rand(140, 220);
    c.spin = rand(14, 26) * (Math.random() < 0.5 ? -1 : 1);
    c.bounces = 0;
    c.sprite.rotation = aim + rand(-0.4, 0.4);
    c.sprite.position.set(x, y);
    this.view.addChild(c.sprite);
    this.live.push(c);
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.sprite.rotation += c.spin * dt;

      if (c.z > 0 || c.vz > 0) {
        c.vz -= GRAVITY * dt;
        c.z += c.vz * dt;
        if (c.z <= 0) {
          c.z = 0;
          c.vz = -c.vz * BOUNCE;
          c.vx *= BOUNCE_FRICTION;
          c.vy *= BOUNCE_FRICTION;
          c.spin *= BOUNCE_SPIN;
          c.bounces++;
          // Tiny hops aren't worth simulating; call it landed.
          if (c.vz < 40) c.vz = 0;
        }
      } else {
        const drag = Math.exp(-dt * FLOOR_DRAG);
        c.vx *= drag;
        c.vy *= drag;
        c.spin *= drag;
        if (c.vx * c.vx + c.vy * c.vy < REST_SPEED * REST_SPEED) {
          this.settle(i);
          continue;
        }
      }
      c.sprite.position.set(c.x, c.y);
      c.sprite.scale.set(1 + c.z * HEIGHT_SCALE);
    }
  }

  /** Burn the shell into the floor where it lies and recycle the sprite. */
  private settle(index: number): void {
    const c = this.live[index];
    this.floor.stampTexture(c.sprite.texture, c.x, c.y, {
      rotation: c.sprite.rotation,
      tint: SETTLED_TINT,
    });
    this.view.removeChild(c.sprite);
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
    this.pool.push(c);
  }

  private create(): Casing {
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
      bounces: 0,
    };
  }
}

import { Container, Sprite, type Texture } from "pixi.js";
import { CASINGS, type CasingId } from "../config/casings";
import { rand } from "../core/random";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { GameTextures } from "./textures";

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
/** Chance a bullet hitting a wall knocks a chunk loose to land on the floor. */
const WALL_CHUNK_CHANCE = 0.6;
/** Vinyl shreds flutter: light gravity and air drag on their flight, per second. */
const SHRED_GRAVITY = 300;
const SHRED_AIR_DRAG = 2.2;

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
  gravity: number;
  /** Horizontal drag in the air, per second; 0 for shells and chunks, which fly clean. */
  airDrag: number;
  /** Sprite scale on the floor; a shell's draws it CASINGS[kind].width long. */
  scale: number;
}

/**
 * Spent shells, chunks of wall and the shreds of a popped decoy. Each ejects from the gun or the wall, tumbles through a couple of bounces, then burns into
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
    const texture = this.tex.casings[kind];
    // Ejection port is on the right of the barrel, so throw at aim + 90 degrees, angled slightly back.
    const a = aim + Math.PI / 2 + rand(0.2, 0.6);
    const speed = rand(90, 170);
    this.toss(
      texture,
      CASINGS[kind].width / texture.width,
      x,
      y,
      6,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      rand(140, 220),
      aim + rand(-0.4, 0.4),
    );
  }

  /**
   * Maybe knock a chunk off the wall at (x, y), whose inward normal is (nx, ny): it drops from
   * the wall face, bounces back across the floor away from the shooter and stays there.
   */
  wallChunk(x: number, y: number, nx: number, ny: number): void {
    if (Math.random() >= WALL_CHUNK_CHANCE) return;
    const chunks = this.tex.wallChunks;
    const a = Math.atan2(ny, nx) + rand(-0.9, 0.9);
    const speed = rand(50, 130);
    this.toss(
      chunks[Math.floor(Math.random() * chunks.length)],
      rand(0.8, 1.2),
      x + nx * 2,
      y + ny * 2,
      rand(8, 16),
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      rand(60, 140),
      rand(0, Math.PI * 2),
    );
  }

  /**
   * A blow-up dummy bursting at (x, y): its googly eyes, a few flaps and `count` bits of vinyl in all,
   * `scale` times their baked size (the eyes `eyeScale`), flung out and fluttering down to stay on
   * the floor where they land.
   */
  shreds(
    x: number,
    y: number,
    count: number,
    speed: number,
    scale: number,
    eyeScale: number,
  ): void {
    const { eyes, flaps, confetti } = this.tex.shreds;
    for (let i = 0; i < count; i++) {
      const texture =
        i < eyes.length
          ? eyes[i]
          : i < eyes.length + flaps.length
            ? flaps[i - eyes.length]
            : confetti[Math.floor(Math.random() * confetti.length)];
      const a = rand(0, Math.PI * 2);
      const v = speed * rand(0.35, 1);
      this.toss(
        texture,
        (i < eyes.length ? eyeScale : scale) * rand(0.85, 1.2),
        x + Math.cos(a) * 8,
        y + Math.sin(a) * 8,
        rand(14, 30),
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(80, 260),
        rand(0, Math.PI * 2),
        SHRED_GRAVITY,
        SHRED_AIR_DRAG,
      );
    }
  }

  private toss(
    texture: Texture,
    scale: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    rotation: number,
    gravity = GRAVITY,
    airDrag = 0,
  ): void {
    if (this.live.length >= MAX_LIVE) this.settle(0);
    const c = this.pool.pop() ?? this.create();
    c.sprite.texture = texture;
    c.scale = scale;
    c.x = x;
    c.y = y;
    c.z = z;
    c.vx = vx;
    c.vy = vy;
    c.vz = vz;
    c.spin = rand(14, 26) * (Math.random() < 0.5 ? -1 : 1);
    c.bounces = 0;
    c.gravity = gravity;
    c.airDrag = airDrag;
    c.sprite.rotation = rotation;
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
        if (c.airDrag > 0) {
          const air = Math.exp(-dt * c.airDrag);
          c.vx *= air;
          c.vy *= air;
        }
        c.vz -= c.gravity * dt;
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
      c.sprite.scale.set(c.scale * (1 + c.z * HEIGHT_SCALE));
    }
  }

  /** Burn the shell into the floor where it lies and recycle the sprite. */
  private settle(index: number): void {
    const c = this.live[index];
    this.floor.stampTexture(c.sprite.texture, c.x, c.y, {
      rotation: c.sprite.rotation,
      scale: c.scale,
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
      gravity: GRAVITY,
      airDrag: 0,
      scale: 1,
    };
  }
}

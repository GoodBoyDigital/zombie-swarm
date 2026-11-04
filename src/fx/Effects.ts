import { Container, Sprite, type Texture } from "pixi.js";
import { rand } from "../core/random";
import type { GameTextures } from "./textures";

type Kind = "flash" | "tracer" | "spark";

interface Particle {
  sprite: Sprite;
  kind: Kind;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
}

/** Tracers draw a little wider than the weapon's tracerWidth; the soft edge eats the outer rows. */
const TRACER_WIDTH_SCALE = 1.6;

/** Short-lived visuals: muzzle flash, hitscan tracer, blood sparks. Sprites are pooled. */
export class Effects {
  readonly view = new Container();
  private readonly live: Particle[] = [];
  private readonly pool: Sprite[] = [];

  constructor(private readonly tex: GameTextures) {}

  muzzleFlash(x: number, y: number, angle: number): void {
    const p = this.spawn("flash", this.tex.muzzleFlash, 0.07);
    p.sprite.anchor.set(0, 0.5);
    p.sprite.position.set(x, y);
    p.sprite.rotation = angle + rand(-0.15, 0.15);
    p.sprite.scale.set(
      rand(0.8, 1.15),
      rand(0.8, 1.2) * (Math.random() < 0.5 ? 1 : -1),
    );
    p.sprite.tint = 0xffffff;
    p.sprite.alpha = 1;
  }

  tracer(x0: number, y0: number, x1: number, y1: number, width: number): void {
    const p = this.spawn("tracer", this.tex.tracer, 0.09);
    p.sprite.anchor.set(0, 0.5);
    p.sprite.position.set(x0, y0);
    p.sprite.rotation = Math.atan2(y1 - y0, x1 - x0);
    p.sprite.width = Math.hypot(x1 - x0, y1 - y0);
    p.sprite.height = width * TRACER_WIDTH_SCALE;
    p.sprite.tint = 0xfff1c2;
    p.sprite.alpha = 0.9;
  }

  /** Blood spray leaving a hit point, biased along the shot direction. */
  bloodBurst(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    count: number,
    tint: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn("spark", this.tex.spark, rand(0.18, 0.4));
      // Tight cone along the shot so the spray clearly carries the bullet's momentum.
      const a = Math.atan2(dirY, dirX) + rand(-0.45, 0.45);
      const speed = rand(220, 560);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = a;
      p.sprite.scale.set(rand(1.6, 3), rand(0.5, 1.1));
      p.sprite.tint = tint;
      p.sprite.alpha = 1;
    }
  }

  /** A ring of glints leaving a pickup point. */
  sparkle(x: number, y: number, tint: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn("spark", this.tex.spark, rand(0.15, 0.3));
      p.sprite.blendMode = "add";
      const a = rand(0, Math.PI * 2);
      const speed = rand(90, 220);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.sprite.anchor.set(0.5);
      p.sprite.position.set(x, y);
      p.sprite.rotation = a;
      p.sprite.scale.set(rand(0.8, 1.4), rand(0.5, 0.8));
      p.sprite.tint = tint;
      p.sprite.alpha = 1;
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.recycle(i);
        continue;
      }
      const t = p.life / p.maxLife;
      switch (p.kind) {
        case "flash":
          p.sprite.alpha = t;
          p.sprite.scale.x = 0.4 + t * 0.8;
          break;
        case "tracer":
          p.sprite.alpha = t * 0.9;
          p.sprite.height = Math.max(0.5, p.sprite.height * (0.6 + t * 0.4));
          break;
        case "spark":
          p.sprite.x += p.vx * dt;
          p.sprite.y += p.vy * dt;
          p.vx *= Math.exp(-dt * 6);
          p.vy *= Math.exp(-dt * 6);
          p.sprite.alpha = Math.min(1, t * 2);
          break;
      }
    }
  }

  private spawn(kind: Kind, texture: Texture, life: number): Particle {
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = texture;
    // The flash is an outlined vector star, so it draws normally; only the tracer glows additively.
    sprite.blendMode = kind === "tracer" ? "add" : "normal";
    sprite.visible = true;
    this.view.addChild(sprite);
    const p: Particle = { sprite, kind, life, maxLife: life, vx: 0, vy: 0 };
    this.live.push(p);
    return p;
  }

  private recycle(index: number): void {
    const p = this.live[index];
    this.view.removeChild(p.sprite);
    this.pool.push(p.sprite);
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
  }
}

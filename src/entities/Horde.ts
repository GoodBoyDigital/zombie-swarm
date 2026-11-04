import { Container } from "pixi.js";
import { MAX_ZOMBIE_RADIUS, ZOMBIES, type ZombieDef } from "../config/zombies";
import { pick, rand } from "../core/random";
import { SpatialHash } from "../core/SpatialHash";
import type { Arena } from "../world/Arena";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { GameTextures } from "../fx/textures";
import { Corpses } from "./Corpses";
import { Zombie } from "./Zombie";

const MAX_ALIVE = 400;
const CELL_SIZE = 48;
/** Spawns per second at the start and after `RAMP_SECONDS` of play. */
const SPAWN_RATE_START = 3;
const SPAWN_RATE_END = 14;
const RAMP_SECONDS = 150;
const CORPSE_TINT_FACTOR = 0.8;
/** Length and width of a hit splat relative to the splat texture, before random variation. */
const SPLAT_STRETCH = 1.1;
const SPLAT_WIDTH = 0.45;
const BLOOD = 0x5fcf3a;
const BLOOD_DARK = 0x3f9a28;

/** Owns every zombie: pooling, spawning through gates, crowd separation and death stamping. */
export class Horde {
  readonly view = new Container();
  readonly alive: Zombie[] = [];
  readonly hash = new SpatialHash<Zombie>(CELL_SIZE);
  /** Bodies still sliding. Drawn under the living so the crowd walks over them. */
  readonly corpses: Corpses;
  kills = 0;
  /** Called on every kill with the body's position and knockback velocity, before it is released. */
  onKill: ((x: number, y: number, kx: number, ky: number) => void) | null =
    null;
  private readonly pool: Zombie[] = [];
  private elapsed = 0;
  private spawnDebt = 0;

  constructor(
    private readonly tex: GameTextures,
    private readonly arena: Arena,
    private readonly floor: FloorCanvas,
  ) {
    // Zombies are added and removed most frames; keep that from rebuilding the whole stage.
    this.view.isRenderGroup = true;
    this.corpses = new Corpses(tex, floor);
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    playerRadius: number,
  ): void {
    this.elapsed += dt;
    this.spawnWave(dt);
    this.corpses.update(dt);

    for (const z of this.alive) z.update(dt, playerX, playerY, playerRadius);

    this.hash.clear();
    for (const z of this.alive) this.hash.insert(z);
    this.separate();
    this.pushOutOfPlayer(playerX, playerY, playerRadius);
    for (const z of this.alive) {
      this.contain(z);
      z.syncSprite();
    }
  }

  /** Walls stop zombies once they're in; before that they're funnelled down their gate's corridor. */
  private contain(z: Zombie): void {
    const r = z.def.radius;
    if (!z.entered) {
      if (this.arena.isInside(z.x, z.y, -r)) z.entered = true;
      else {
        const g = z.gate;
        const lo = -g.halfWidth + r;
        const hi = g.halfWidth - r;
        if (g.side === "top" || g.side === "bottom")
          z.x = g.entry.x + clamp(z.x - g.entry.x, lo, hi);
        else z.y = g.entry.y + clamp(z.y - g.entry.y, lo, hi);
        return;
      }
    }
    const b = this.arena.bounds;
    z.x = clamp(z.x, b.minX + r, b.maxX - r);
    z.y = clamp(z.y, b.minY + r, b.maxY - r);
  }

  /** Kill a zombie. The body keeps its knockback and skids to rest before it's stamped down. */
  kill(z: Zombie): void {
    this.kills++;
    this.onKill?.(z.x, z.y, z.kx, z.ky);
    this.corpses.spawn(
      z.x,
      z.y,
      z.facing,
      z.kx,
      z.ky,
      z.def.radius,
      shadeTint(z.tint, CORPSE_TINT_FACTOR),
    );
    this.release(z);
  }

  /** Paint a streak of blood thrown out behind the hit, along the shot direction. */
  splat(x: number, y: number, dirX: number, dirY: number): void {
    const throwDist = rand(18, 56);
    this.floor.stampTexture(
      pick(this.tex.splats),
      x + dirX * throwDist,
      y + dirY * throwDist,
      {
        rotation: Math.atan2(dirY, dirX) + rand(-0.25, 0.25),
        scaleX: SPLAT_STRETCH * rand(0.6, 1.2),
        scaleY: SPLAT_WIDTH * rand(0.6, 1.2),
        tint: Math.random() < 0.5 ? BLOOD : BLOOD_DARK,
        alpha: rand(0.7, 0.95),
      },
    );
  }

  private spawnWave(dt: number): void {
    const t = Math.min(1, this.elapsed / RAMP_SECONDS);
    this.spawnDebt +=
      dt * (SPAWN_RATE_START + (SPAWN_RATE_END - SPAWN_RATE_START) * t);
    while (this.spawnDebt >= 1 && this.alive.length < MAX_ALIVE) {
      this.spawnDebt -= 1;
      this.spawn(ZOMBIES.walker);
    }
    if (this.alive.length >= MAX_ALIVE) this.spawnDebt = 0;
  }

  private spawn(def: ZombieDef): void {
    const z = this.pool.pop() ?? this.create();
    z.spawn(def, pick(this.arena.gates));
    this.alive.push(z);
    this.view.addChild(z.sprite);
  }

  private create(): Zombie {
    return new Zombie(this.tex.zombie, this.tex.zombieFlash);
  }

  private release(z: Zombie): void {
    const i = this.alive.indexOf(z);
    if (i >= 0) {
      this.alive[i] = this.alive[this.alive.length - 1];
      this.alive.pop();
    }
    this.view.removeChild(z.sprite);
    z.sprite.visible = false;
    this.pool.push(z);
  }

  /** Soft-body crowding: overlapping zombies nudge each other apart so the swarm stays a swarm, not a stack. */
  private separate(): void {
    for (const a of this.alive) {
      const r = a.def.radius + MAX_ZOMBIE_RADIUS;
      this.hash.queryBox(a.x - r, a.y - r, a.x + r, a.y + r, (b) => {
        if (b === a || b.dead) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.def.radius + b.def.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) return;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        a.x -= dx * push;
        a.y -= dy * push;
      });
    }
  }

  private pushOutOfPlayer(px: number, py: number, pr: number): void {
    for (const z of this.alive) {
      const dx = z.x - px;
      const dy = z.y - py;
      const min = z.def.radius + pr;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      z.x += (dx / d) * (min - d);
      z.y += (dy / d) * (min - d);
    }
  }
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

function shadeTint(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

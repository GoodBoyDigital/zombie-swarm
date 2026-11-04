import { Container, Graphics } from "pixi.js";
import {
  MAX_ZOMBIE_RADIUS,
  SPAWN,
  SPAWN_TABLE,
  ZOMBIE_AI,
  ZOMBIES,
  type ZombieDef,
  type ZombieId,
} from "../config/zombies";
import { pick, rand } from "../core/random";
import { SpatialHash } from "../core/SpatialHash";
import type { Arena } from "../world/Arena";
import type { FloorCanvas } from "../world/FloorCanvas";
import { Limbs } from "../fx/Limbs";
import type { GameTextures } from "../fx/textures";
import { Corpses } from "./Corpses";
import { Zombie } from "./Zombie";
import { aiDebug } from "./ZombieBrain";

const CELL_SIZE = 48;
const CORPSE_TINT_FACTOR = 0.8;
/** Length and width of a hit splat relative to the splat texture, before random variation. */
const SPLAT_STRETCH = 1.1;
const SPLAT_WIDTH = 0.45;
const BLOOD = 0x5fcf3a;
const BLOOD_DARK = 0x3f9a28;
const ZOMBIE_IDS = Object.keys(ZOMBIES) as ZombieId[];
/** How long the debug overlay shows a gunshot's noise ring. */
const NOISE_RING_SECONDS = 0.35;

/** Owns every zombie: pooling, spawning through gates, crowd separation and death stamping. */
export class Horde {
  readonly view = new Container();
  readonly alive: Zombie[] = [];
  readonly hash = new SpatialHash<Zombie>(CELL_SIZE);
  /** Bodies still sliding. Drawn under the living so the crowd walks over them. */
  readonly corpses: Corpses;
  /** Pieces shot off zombies, tumbling to the floor. Game draws them over the living and the effects so they fly clear of the crowd and the spray. */
  readonly limbs: Limbs;
  /** AI debug overlay (key V): the player's aggro radius and the last gunshot's noise ring. */
  readonly debugView = new Graphics();
  kills = 0;
  /** Called on every kill with the body's position and knockback velocity, before it is released. */
  onKill: ((z: Zombie) => void) | null = null;
  /** How many of the living are still wandering, for the debug HUD. */
  wandering = 0;
  /** False once the player is down: nobody notices him any more. */
  hunting = true;
  private readonly lastNoise = { x: 0, y: 0, radius: 0, age: Infinity };
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
    this.limbs = new Limbs(tex, floor);
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
    this.limbs.update(dt);

    for (const z of this.alive)
      z.update(dt, playerX, playerY, playerRadius, this.hunting);

    this.hash.clear();
    for (const z of this.alive) this.hash.insert(z);
    this.separate();
    this.pushOutOfPlayer(playerX, playerY, playerRadius);
    this.wandering = 0;
    for (const z of this.alive) {
      this.contain(z);
      z.syncSprite();
      if (z.brain.wandering) this.wandering++;
    }
    this.drawDebug(dt, playerX, playerY);
  }

  /**
   * Summed `damageScale` of every zombie touching the player, i.e. within the two radii plus `margin`.
   * Reads the hash built this frame, so call it after update.
   */
  contact(px: number, py: number, pr: number, margin: number): number {
    const reach = pr + margin + MAX_ZOMBIE_RADIUS;
    let total = 0;
    this.hash.queryBox(px - reach, py - reach, px + reach, py + reach, (z) => {
      if (z.dead) return;
      const dx = z.x - px;
      const dy = z.y - py;
      const touch = z.def.radius + pr + margin;
      if (dx * dx + dy * dy < touch * touch) total += z.def.damageScale;
    });
    return total;
  }

  /** The player is down: every zombie loses interest and nobody notices him again. */
  calm(): void {
    this.hunting = false;
    for (const z of this.alive) z.brain.forget(z);
  }

  /** A sound at (x, y) alerts every zombie within `radius`; they start chasing after their reaction delay. */
  noise(x: number, y: number, radius: number): void {
    const r2 = radius * radius;
    this.hash.queryBox(x - radius, y - radius, x + radius, y + radius, (z) => {
      if (z.dead) return;
      const dx = z.x - x;
      const dy = z.y - y;
      if (dx * dx + dy * dy <= r2) z.brain.alert();
    });
    this.lastNoise.x = x;
    this.lastNoise.y = y;
    this.lastNoise.radius = radius;
    this.lastNoise.age = 0;
  }

  private drawDebug(dt: number, playerX: number, playerY: number): void {
    this.lastNoise.age += dt;
    this.debugView.visible = aiDebug.enabled;
    if (!aiDebug.enabled) return;
    const g = this.debugView.clear();
    g.circle(playerX, playerY, ZOMBIE_AI.aggroRadius).stroke({
      width: 2,
      color: 0x60a0ff,
      alpha: 0.6,
    });
    g.circle(playerX, playerY, ZOMBIE_AI.loseRadius).stroke({
      width: 2,
      color: 0x60a0ff,
      alpha: 0.25,
    });
    const fade = 1 - this.lastNoise.age / NOISE_RING_SECONDS;
    if (fade <= 0) return;
    g.circle(this.lastNoise.x, this.lastNoise.y, this.lastNoise.radius).stroke({
      width: 3,
      color: 0xffc040,
      alpha: fade * 0.8,
    });
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
    this.onKill?.(z);
    this.corpses.spawn(
      z.x,
      z.y,
      z.facing,
      z.kx,
      z.ky,
      z.def,
      z.missing,
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
    const t = Math.min(1, this.elapsed / SPAWN.rampSeconds) ** SPAWN.rampPower;
    this.spawnDebt +=
      dt * (SPAWN.rateStart + (SPAWN.rateEnd - SPAWN.rateStart) * t);
    while (this.spawnDebt >= 1 && this.alive.length < SPAWN.maxAlive) {
      this.spawnDebt -= 1;
      this.spawn(ZOMBIES[this.pickType()]);
    }
    if (this.alive.length >= SPAWN.maxAlive) this.spawnDebt = 0;
  }

  private spawn(def: ZombieDef): void {
    const z = this.pool.pop() ?? this.create();
    z.spawn(def, pick(this.arena.gates));
    this.alive.push(z);
    this.view.addChild(z.sprite);
  }

  private create(): Zombie {
    return new Zombie(this.tex);
  }

  /** Weighted pick from the spawn table, interpolating weights between the rows around `elapsed`. */
  private pickType(): ZombieId {
    let next = SPAWN_TABLE.length - 1;
    while (next > 0 && SPAWN_TABLE[next - 1].at > this.elapsed) next--;
    const hi = SPAWN_TABLE[next];
    const lo = SPAWN_TABLE[Math.max(0, next - 1)];
    const span = hi.at - lo.at;
    const t = span > 0 ? clamp((this.elapsed - lo.at) / span, 0, 1) : 1;
    const weight = (id: ZombieId) =>
      lo.weights[id] + (hi.weights[id] - lo.weights[id]) * t;
    let total = 0;
    for (const id of ZOMBIE_IDS) total += weight(id);
    let r = Math.random() * total;
    for (const id of ZOMBIE_IDS) {
      r -= weight(id);
      if (r < 0) return id;
    }
    return ZOMBIE_IDS[0];
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

  /**
   * Soft-body crowding: overlapping zombies nudge each other apart so the swarm stays a swarm, not a stack.
   * The same neighbour pass feeds wanderers' herd sums (everyone the query visits, so roughly a cell around them).
   */
  private separate(): void {
    for (const a of this.alive) {
      const r = a.def.radius + MAX_ZOMBIE_RADIUS;
      const herd = a.entered && a.brain.wandering ? a.brain : null;
      this.hash.queryBox(a.x - r, a.y - r, a.x + r, a.y + r, (b) => {
        if (b === a || b.dead) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (herd) {
          herd.herdCount++;
          herd.herdX += b.x;
          herd.herdY += b.y;
          herd.herdCos += Math.cos(b.facing);
          herd.herdSin += Math.sin(b.facing);
        }
        const min = a.def.radius + b.def.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) return;
        const d = Math.sqrt(d2);
        // Each pair is visited from both sides; the lighter body takes the larger share of the overlap.
        const push = ((min - d) / d) * (b.def.mass / (a.def.mass + b.def.mass));
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

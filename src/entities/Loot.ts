import { Particle, ParticleContainer } from "pixi.js";
import type { Audio } from "../audio/Audio";
import {
  LOOT_DEFS,
  LOOT_RULES,
  type LootCounter,
  type LootDef,
  type LootId,
} from "../config/loot";
import { PLAYER } from "../config/player";
import { pickWeighted, rand } from "../core/random";
import { SpatialHash } from "../core/SpatialHash";
import type { Effects } from "../fx/Effects";
import type { GameTextures } from "../fx/textures";
import type { Player } from "./Player";

const CELL_SIZE = 32;
/** Fake vertical physics for the hop out of the body. */
const GRAVITY = 900;
const BOUNCE = 0.4;
const MIN_BOUNCE_SPEED = 40;
/** Seconds the pop-in scale takes to settle. */
const POP_IN = 0.15;
/** Pickup pitch climbs per item collected inside the window, then falls back. */
const COMBO_WINDOW = 0.6;
const COMBO_PITCH_STEP = 0.05;
const COMBO_MAX = 14;
const SPARKLE: Record<LootId, number> = {
  coin: 0xffd84a,
  gem: 0x7cf7a0,
  bigGem: 0xe08cff,
};

interface LootItem {
  particle: Particle;
  def: LootDef;
  /** Position in `live`, kept current through swap-removes so collection is O(1). */
  index: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/**
 * Coins and gems on the floor. One ParticleContainer draws everything in a single call; items
 * are plain objects over pooled Particles, swap-removed, and parked at alpha 0 rather than
 * removed from the container so the per-frame loop never allocates or splices.
 *
 * Pixi bakes a particle's scale and anchor into the `vertex` attribute, so `vertex` must be
 * dynamic for the pop-in to animate; uvs stay static and are re-uploaded only when a reused
 * particle changes kind.
 */
export class Loot {
  readonly view = new ParticleContainer({
    dynamicProperties: {
      vertex: true,
      position: true,
      color: true,
      rotation: false,
      uvs: false,
    },
  });
  readonly counters: Record<LootCounter, number> = { coins: 0, gems: 0 };
  private readonly live: LootItem[] = [];
  private readonly pool: LootItem[] = [];
  private readonly hash = new SpatialHash<LootItem>(CELL_SIZE);
  private combo = 0;
  private comboTimer = 0;

  constructor(
    private readonly tex: GameTextures,
    private readonly fx: Effects,
    private readonly audio: Audio,
  ) {}

  get count(): number {
    return this.live.length;
  }

  /** The pinata: a handful of items thrown out of a kill. */
  burst(x: number, y: number): void {
    const n = Math.floor(rand(LOOT_RULES.burstMin, LOOT_RULES.burstMax + 1));
    for (let i = 0; i < n; i++) this.spawn(pickWeighted(LOOT_DEFS), x, y);
  }

  private spawn(def: LootDef, x: number, y: number): void {
    while (this.live.length >= LOOT_RULES.maxItems) this.release(this.oldest());
    const item = this.pool.pop() ?? this.create();
    item.def = def;
    item.x = x;
    item.y = y;
    item.z = 0;
    const a = rand(0, Math.PI * 2);
    const speed = rand(LOOT_RULES.scatterMin, LOOT_RULES.scatterMax);
    item.vx = Math.cos(a) * speed;
    item.vy = Math.sin(a) * speed;
    item.vz = rand(LOOT_RULES.hopMin, LOOT_RULES.hopMax);
    item.life = LOOT_RULES.lifetime;
    item.index = this.live.length;
    this.live.push(item);
    const p = item.particle;
    const texture = this.tex.loot[def.id as LootId];
    if (p.texture !== texture) {
      p.texture = texture;
      this.view.update();
    }
    p.alpha = 1;
    p.scaleX = p.scaleY = 0;
  }

  update(dt: number, player: Player): void {
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;

    const drag = Math.exp(-dt * LOOT_RULES.friction);
    this.hash.clear();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const it = this.live[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.release(i);
        continue;
      }
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.vx *= drag;
      it.vy *= drag;
      if (it.z > 0 || it.vz > 0) {
        it.vz -= GRAVITY * dt;
        it.z += it.vz * dt;
        if (it.z <= 0) {
          it.z = 0;
          it.vz = it.vz < -MIN_BOUNCE_SPEED ? -it.vz * BOUNCE : 0;
        }
      }
      this.hash.insert(it);
    }

    this.attract(player);

    const { lifetime, blinkSeconds } = LOOT_RULES;
    for (const it of this.live) {
      const p = it.particle;
      p.x = it.x;
      p.y = it.y - it.z;
      const age = lifetime - it.life;
      const s = age < POP_IN ? age / POP_IN : 1;
      p.scaleX = p.scaleY = s;
      if (it.life < blinkSeconds) p.alpha = (it.life * 10) % 2 < 1 ? 1 : 0.25;
    }
  }

  /** Items near the player drift in; items touching the player are collected. */
  private attract(player: Player): void {
    const px = player.x;
    const py = player.y;
    const radius = PLAYER.magnetRadius * player.magnetScale;
    const pull = PLAYER.magnetPull * player.magnetScale;
    const collect = player.radius + PLAYER.collectRadius;
    this.hash.queryBox(
      px - radius,
      py - radius,
      px + radius,
      py + radius,
      (it) => {
        const dx = px - it.x;
        const dy = py - it.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < collect * collect) {
          this.collect(it);
          return;
        }
        if (d2 >= radius * radius) return;
        const d = Math.sqrt(d2);
        // Strongest at the player's feet, nothing at the edge, so items ease in rather than snap.
        const f = ((1 - d / radius) * pull) / d;
        it.vx += dx * f;
        it.vy += dy * f;
      },
    );
  }

  private collect(it: LootItem): void {
    const { def } = it;
    this.counters[def.counter] += def.value;
    this.combo = Math.min(COMBO_MAX, this.combo + 1);
    this.comboTimer = COMBO_WINDOW;
    this.audio.play(def.counter === "coins" ? "pickupCoin" : "pickupGem", {
      pitch: 1 + this.combo * COMBO_PITCH_STEP,
      volume: 0.45,
    });
    this.fx.sparkle(it.x, it.y, SPARKLE[def.id as LootId]);
    this.release(it.index);
  }

  /** With one shared lifetime, the oldest item is simply the one with the least life left. */
  private oldest(): number {
    let best = 0;
    for (let i = 1; i < this.live.length; i++)
      if (this.live[i].life < this.live[best].life) best = i;
    return best;
  }

  private release(index: number): void {
    const it = this.live[index];
    const last = this.live[this.live.length - 1];
    this.live[index] = last;
    last.index = index;
    this.live.pop();
    it.particle.alpha = 0;
    this.pool.push(it);
  }

  private create(): LootItem {
    const particle = new Particle({
      texture: this.tex.loot.coin,
      anchorX: 0.5,
      anchorY: 0.5,
    });
    this.view.addParticle(particle);
    return {
      particle,
      def: LOOT_DEFS[0],
      index: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
    };
  }
}

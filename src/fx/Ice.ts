import { Container, Sprite } from "pixi.js";
import type { Audio } from "../audio/Audio";
import { ICE } from "../config/ice";
import { PART_IDS } from "../config/zombies";
import { pick, rand } from "../core/random";
import type { Zombie } from "../entities/Zombie";
import type { FloorCanvas } from "../world/FloorCanvas";
import type { Effects } from "./Effects";
import type { Limbs } from "./Limbs";
import type { GameTextures } from "./textures";

const TWO_PI = Math.PI * 2;
/** A popping block starts this much bigger and settles onto the zombie. */
const POP_GROW = 0.35;
/** Alpha of the block on the dim beats of the thaw flicker, as a share of full. */
const FLICKER_DIM = 0.4;
/** Ice chunks thrown by a shatter: world px scale, and their spread off the hit direction. */
const CHUNK_SCALE = 1.1;
const CHUNK_SPREAD = 1.2;

interface Block {
  sprite: Sprite;
  variant: number;
  /** Seconds since frozen; negative while the blast front is still on its way. */
  age: number;
  /** Final seconds of the freeze that crack and flicker, from whatever froze it. */
  warning: number;
  scale: number;
  tilt: number;
  /** Flicker phase, so a frozen crowd doesn't blink in unison. */
  phase: number;
  cracked: boolean;
}

/**
 * Frozen zombies' ice: one pooled block sprite over each, cracking and flickering before it thaws,
 * and the shatter when a frozen zombie is killed (shards, frozen limbs, ice chunks, frost on the
 * floor). The zombie keeps the gameplay state (`Zombie.frozenFor`); this is only how it looks and
 * sounds. Owned by the horde, which updates it after moving everyone and calls `shatter` on a kill.
 */
export class IceBlocks {
  readonly view = new Container();
  private readonly blocks = new Map<Zombie, Block>();
  private readonly pool: Sprite[] = [];
  /** World seconds, for the flicker and the sound throttles. */
  private clock = 0;
  private lastShatter = -Infinity;
  private lastCrack = -Infinity;
  private readonly stump = { x: 0, y: 0 };

  constructor(
    private readonly tex: GameTextures,
    private readonly fx: Effects,
    private readonly floor: FloorCanvas,
    private readonly audio: Audio,
    private readonly limbs: Limbs,
  ) {
    this.view.isRenderGroup = true;
  }

  /** How many zombies are frozen right now. */
  get count(): number {
    return this.blocks.size;
  }

  /** The block over a frozen zombie, e.g. for the colour mask; undefined if it isn't frozen. */
  blockOf(z: Zombie): Sprite | undefined {
    return this.blocks.get(z)?.sprite;
  }

  /**
   * Freeze `z` solid for `seconds`, the last `warning` of them cracking. Its block pops in after
   * `delay`, as the blast front reaches it. Freezing a frozen zombie again refreshes it.
   */
  freeze(z: Zombie, seconds: number, warning: number, delay: number): void {
    z.freeze(seconds);
    const current = this.blocks.get(z);
    if (current) {
      current.warning = warning;
      current.cracked = false;
      current.sprite.texture = this.tex.ice.blocks[current.variant];
      return;
    }
    const sprite = this.pool.pop() ?? new Sprite({ anchor: 0.5 });
    const variant = Math.floor(Math.random() * this.tex.ice.blocks.length);
    sprite.texture = this.tex.ice.blocks[variant];
    sprite.visible = false;
    this.view.addChild(sprite);
    this.blocks.set(z, {
      sprite,
      variant,
      age: -delay,
      warning,
      scale: 1 + rand(-ICE.blockJitter, ICE.blockJitter),
      tilt: rand(-ICE.blockTilt, ICE.blockTilt),
      phase: rand(0, TWO_PI),
      cracked: false,
    });
  }

  /** After the horde has moved: blocks follow their zombies, crack near the end and break on thaw. */
  update(dt: number): void {
    this.clock += dt;
    for (const [z, b] of this.blocks) {
      if (!z.frozen) {
        this.thaw(z, b);
        continue;
      }
      b.age += dt;
      this.place(z, b);
    }
  }

  /**
   * A frozen zombie was killed: the ice and body burst into shards, frozen limbs and chunks of ice,
   * and slush and frost are left on the floor instead of a corpse. Call before it is released.
   */
  shatter(z: Zombie): void {
    const b = this.blocks.get(z);
    const x = b?.sprite.visible ? b.sprite.x : z.x;
    const y = b?.sprite.visible ? b.sprite.y : z.y;
    let dirX = z.kx;
    let dirY = z.ky;
    const speed = Math.hypot(dirX, dirY);
    if (speed > 0) {
      dirX /= speed;
      dirY /= speed;
    } else {
      const a = rand(0, TWO_PI);
      dirX = Math.cos(a);
      dirY = Math.sin(a);
    }
    // Pieces inherit the zombie's knockback; a soft hit still throws them clear.
    if (speed < ICE.minFling) {
      z.kx = dirX * ICE.minFling;
      z.ky = dirY * ICE.minFling;
    }
    this.fx.iceShards(x, y, dirX, dirY, ICE.shatterShards);
    const parts = z.def.art.parts;
    for (let bit = 0; bit < PART_IDS.length; bit++) {
      if (!parts?.[PART_IDS[bit]] || z.missing & (1 << bit)) continue;
      if (Math.random() < ICE.limbChance)
        this.limbs.launch(z, bit, dirX, dirY, this.stump, true);
    }
    const along = Math.atan2(dirY, dirX);
    for (let i = 0; i < ICE.chunks; i++)
      this.limbs.toss(
        pick(this.tex.ice.chunks),
        x + rand(-4, 4),
        y + rand(-4, 4),
        along + rand(-CHUNK_SPREAD, CHUNK_SPREAD),
        rand(80, 220) + speed * 0.3,
        CHUNK_SCALE * rand(0.8, 1.3),
      );
    this.floor.frostSplat(x, y, dirX, dirY);
    // One per volley: everything one shot or blast breaks lands on the same frame.
    if (this.clock - this.lastShatter >= ICE.soundGap) {
      this.lastShatter = this.clock;
      this.audio.play("iceShatter", { pitch: rand(0.9, 1.15), volume: 0.75 });
    }
    if (b) this.release(z, b);
  }

  /** Stretch the block over the zombie's sprite, popping in, then cracking and flickering near the end. */
  private place(z: Zombie, b: Block): void {
    const ice = b.sprite;
    if (b.age < 0) return;
    const s = z.sprite;
    const t = s.texture;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    // The sprite's anchor is the body; the block centres on the whole art, arms and all.
    const ox = (0.5 - s.anchor.x) * t.width * s.scale.x;
    const oy = (0.5 - s.anchor.y) * t.height * s.scale.y;
    let x = s.x + ox * cos - oy * sin;
    let y = s.y + ox * sin + oy * cos;
    const pop = Math.min(1, b.age / ICE.popSeconds);
    const size = ICE.blockSize * b.scale * (1 + (1 - pop) * POP_GROW);
    ice.visible = true;
    ice.rotation = s.rotation + b.tilt;
    ice.scale.set(
      (t.width * Math.abs(s.scale.x) * size) / ice.texture.width,
      (t.height * Math.abs(s.scale.y) * size) / ice.texture.height,
    );
    ice.alpha = ICE.blockAlpha * pop;
    if (z.frozenFor < b.warning) {
      if (!b.cracked) {
        b.cracked = true;
        ice.texture = this.tex.ice.cracked[b.variant];
        this.crack(0.5);
      }
      const on = Math.sin(this.clock * TWO_PI * ICE.flickerRate + b.phase) > 0;
      ice.alpha = ICE.blockAlpha * (on ? 1 : FLICKER_DIM);
      x += rand(-ICE.shake, ICE.shake);
      y += rand(-ICE.shake, ICE.shake);
    }
    ice.position.set(x, y);
  }

  /** Time's up: the block breaks off in a few shards and the zombie carries on. */
  private thaw(z: Zombie, b: Block): void {
    if (b.sprite.visible)
      this.fx.iceShards(
        b.sprite.x,
        b.sprite.y,
        Math.cos(z.facing),
        Math.sin(z.facing),
        ICE.thawShards,
      );
    this.crack(0.8);
    this.release(z, b);
  }

  private crack(volume: number): void {
    if (this.clock - this.lastCrack < ICE.soundGap) return;
    this.lastCrack = this.clock;
    this.audio.play("iceCrack", { pitch: rand(0.9, 1.2), volume });
  }

  private release(z: Zombie, b: Block): void {
    this.blocks.delete(z);
    this.view.removeChild(b.sprite);
    b.sprite.visible = false;
    this.pool.push(b.sprite);
  }
}

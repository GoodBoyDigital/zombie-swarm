import { assetUrl } from "../core/assetUrl";
import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  type Renderer,
  type Spritesheet,
} from "pixi.js";
import { CASINGS, type CasingId } from "../config/casings";
import type { LootId } from "../config/loot";
import { POWERUP_DEFS } from "../config/powerups";
import { WEAPONS } from "../config/weapons";
import {
  PART_IDS,
  ZOMBIES,
  type NeckCap,
  type PartShape,
  type ZombieArt,
} from "../config/zombies";
import { rand } from "../core/random";

export interface ZombieLook {
  body: Texture;
  /** White silhouette of the body, swapped in for the hit flash. */
  flash: Texture;
  /** Lying-down poses, one picked at random per death. */
  corpses: Texture[];
  /** Solid pixels of `body`, for finding which part a shot struck; null for types without parts. */
  opaque: OpacityMask | null;
}

/** One flag per source pixel of a texture: 1 where it is solid. Row-major from the top-left. */
export interface OpacityMask {
  width: number;
  height: number;
  solid: Uint8Array;
}

/** One part on its own, for the piece that flies off. */
export interface SeveredPart {
  /** One picked per detach. */
  textures: Texture[];
  /** Centre of the piece on the body texture, in world px from its top-left. */
  x: number;
  y: number;
  /** Added to the body's rotation at launch: cut-outs sit as they were, sprite pieces are drawn upright. */
  rotation: number;
}

export interface ZombieTextures {
  /** Indexed by missing-parts mask: 0 is the whole zombie, and the only entry for types without parts. */
  looks: ZombieLook[];
  /** Severed pieces by part bit; null where the type has no such part. */
  parts: (SeveredPart | null)[];
}

export interface GameTextures {
  /** Sprite sets by ZombieArt key. */
  zombies: Record<string, ZombieTextures>;
  player: Texture;
  /** White silhouette for the hurt flash. */
  playerFlash: Texture;
  /** The fallen player, stamped into the floor on death. */
  playerCorpse: Texture;
  /** Held weapon art by weapon id, from each WeaponDef's sprite path. */
  weapons: Record<string, Texture>;
  muzzleFlash: Texture;
  /** Soft-edged band stretched along each hitscan shot. */
  tracer: Texture;
  /** Seamless electric filaments, blue starburst and the persistent rail burn. */
  rail: { glow: Texture; energy: Texture; burst: Texture; scorch: Texture };
  spark: Texture;
  splats: Texture[];
  casings: Record<CasingId, Texture>;
  /** Little broken bits of wall that bullets knock onto the floor. */
  wallChunks: Texture[];
  /** Repeating floor and wall tiles. */
  tiles: { concrete: Texture; wall: Texture };
  /** Pickup sprites. All loot shares one texture source so a ParticleContainer can draw it in one call. */
  loot: Record<LootId, Texture>;
  /** Each power-up's icon, from its def's `icon` path. Drawn on orbs and HUD pills. */
  powerupIcons: Record<string, Texture>;
  /** Explosion parts, all white or grey so they tint: a vector fireball, shockwave ring, soft flash, scorch variants. */
  blast: { boom: Texture; ring: Texture; glow: Texture; scorches: Texture[] };
}

const SPRITES = {
  player: "/sprites/player.png",
  playerFlash: "/sprites/player-flash.png",
  playerCorpse: "/sprites/player-corpse.png",
  rocket: "/sprites/projectile-rocket.png",
  tileConcrete: "/assets/tiles/tile-concrete.png",
  tileWall: "/assets/tiles/tile-wall.png",
} as const;

const LOOT_SPRITES: Record<LootId, string> = {
  coin: "/sprites/loot-coin.png",
  bill: "/sprites/loot_bill.png",
  gem: "/sprites/loot-gem.png",
  bigGem: "/sprites/loot-big-gem.png",
};

/**
 * Sprite sources ship at twice their on-screen size so they stay crisp when rotated, scaled by the
 * camera or drawn on high-density screens. This is the one place sprite pixels map to world pixels:
 * every sprite texture is loaded with resolution 1 / ART_SCALE, so `texture.width` is already in
 * world px and anchors, hand points, grips and muzzles keep working as fractions.
 */
export const ART_SCALE = 0.5;
const ART_RESOLUTION = 1 / ART_SCALE;

/**
 * Texture filtering for all game art. Linear keeps the vector art smooth when sprites rotate or
 * scale; compare with ?filter=nearest in the URL.
 */
const SCALE_MODE: "nearest" | "linear" =
  new URLSearchParams(location.search).get("filter") === "nearest"
    ? "nearest"
    : "linear";

/** Explosion textures are drawn at this radius in world px; Effects scales them to each blast. */
export const BLAST_TEXTURE_RADIUS = 128;

/** Outline colour shared with the sprite art, for anything drawn here that needs an edge. */
const INK = 0x151a15;
/** Broken concrete, matching the pale rim of the bullet chips in the walls. */
const WALL_CHUNK = 0x6e675e;

/**
 * Character, weapon and pickup art comes from the AssetPack atlas; repeating tiles load separately.
 * Effects (splats, sparks, muzzle flash, tracer) are drawn here as vector shapes at
 * full resolution so they match.
 */
export async function createTextures(
  renderer: Renderer,
): Promise<GameTextures> {
  const weaponDefs = Object.values(WEAPONS);
  const zombieArts: ZombieArt[] = [
    ...new Map(Object.values(ZOMBIES).map((z) => [z.art.key, z.art])).values(),
  ];
  const zombiePaths = (art: ZombieArt) => ({
    body: `/sprites/zombie-${art.key}.png`,
    flash: `/sprites/zombie-${art.key}-flash.png`,
    corpses: art.corpses.map(
      (n) => `/sprites/zombie-${art.key}-corpse-${n}.png`,
    ),
  });
  const tilePaths = [SPRITES.tileConcrete, SPRITES.tileWall];
  const [sheet, tiles] = await Promise.all([
    Assets.load<Spritesheet>({
      src: assetUrl("/assets/sprites@2x.json"),
      data: { textureOptions: { scaleMode: SCALE_MODE } },
    }),
    Promise.all(
      tilePaths.map((src) =>
        Assets.load<Texture>({
          alias: src,
          src: assetUrl(src),
          data: { resolution: ART_RESOLUTION, scaleMode: SCALE_MODE },
        }),
      ),
    ),
  ]);
  const loaded: Record<string, Texture> = Object.fromEntries(
    tilePaths.map((path, i) => [path, tiles[i]]),
  );
  // Config sprite paths are logical keys, not individual image requests.
  for (const [name, texture] of Object.entries(sheet.textures)) {
    const key = `/sprites/${name}`;
    loaded[key] = texture;
    Assets.cache.set(key, texture);
  }
  const sprite = (key: keyof typeof SPRITES) => loaded[SPRITES[key]];
  const weapons = Object.fromEntries(
    weaponDefs.map((w) => [w.id, loaded[w.sprite.path]]),
  );
  const zombies = Object.fromEntries(
    zombieArts.map((art) => {
      const paths = zombiePaths(art);
      const whole: ZombieLook = {
        body: loaded[paths.body],
        flash: loaded[paths.flash],
        corpses: paths.corpses.map((path) => loaded[path]),
        opaque: null,
      };
      return [
        art.key,
        art.parts
          ? carveParts(renderer, art.parts, whole, loaded)
          : { looks: [whole], parts: [] },
      ];
    }),
  );

  /** Bake vector shapes into a texture at sprite resolution, antialiased. */
  const make = (g: Graphics, resolution = ART_RESOLUTION) => {
    const texture = renderer.generateTexture({
      target: g,
      antialias: true,
      resolution,
      textureSourceOptions: { scaleMode: SCALE_MODE },
    });
    g.destroy();
    return texture;
  };

  // A round dot with a soft rim; stretched by Effects into short streaks.
  const spark = new Graphics()
    .circle(0, 0, 3.4)
    .fill({ color: 0xffffff, alpha: 0.35 })
    .circle(0, 0, 2.8)
    .fill({ color: 0xffffff, alpha: 0.6 })
    .circle(0, 0, 2.2)
    .fill(0xffffff);

  // Bold starburst blasting along +x, anchored at its left middle by Effects: a long centre
  // spike, two flanking spikes and short side spikes, in ink, orange, yellow and a white core.
  const flash = new Graphics();
  const BURST: [number, number][] = [
    [0, 1],
    [0.42, 0.62],
    [-0.42, 0.62],
    [1.05, 0.42],
    [-1.05, 0.42],
    [1.75, 0.26],
    [-1.75, 0.26],
  ];
  const burst = (len: number, valley: number, color: number) => {
    const spikes = [...BURST].sort((p, q) => p[0] - q[0]);
    const points: number[] = [];
    spikes.forEach(([angle, reach], i) => {
      points.push(Math.cos(angle) * len * reach, Math.sin(angle) * len * reach);
      const next = spikes[i + 1] ?? [spikes[0][0] + Math.PI * 2, 0];
      const mid = (angle + next[0]) / 2;
      points.push(Math.cos(mid) * valley, Math.sin(mid) * valley);
    });
    flash.poly(points).fill(color);
  };
  burst(58, 10, INK);
  burst(51, 8, 0xff7a1a);
  burst(38, 6, 0xffd23a);
  flash.circle(4, 0, 5).fill(0xffffff);

  // Soft-edged band for tracers: opaque core, fading rows above and below. Stretched to length.
  const tracer = new Graphics();
  [0.15, 0.45, 0.85, 1, 1, 0.85, 0.45, 0.15].forEach((alpha, row) =>
    tracer.rect(0, row - 4, 2, 1).fill({ color: 0xffffff, alpha }),
  );

  // The wider rail glow needs fully transparent edges, unlike the thin tracer band.
  const railGlow = new Graphics();
  for (let row = 0; row < 32; row++) {
    const alpha = (1 - Math.abs(row - 15.5) / 15.5) ** 2;
    railGlow.rect(0, row, 2, 1).fill({ color: 0xffffff, alpha });
  }

  // A seamless 128x32 tile. Both ends meet at the same y so filaments scroll without a seam.
  const energy = new Graphics()
    .rect(0, 0, 128, 32)
    .fill({ color: 0xffffff, alpha: 0 });
  energy
    .moveTo(0, 16)
    .lineTo(16, 7)
    .lineTo(34, 7)
    .lineTo(51, 16)
    .lineTo(77, 16)
    .lineTo(94, 25)
    .lineTo(112, 25)
    .lineTo(128, 16)
    .stroke({ width: 3.5, color: 0xffffff, alpha: 0.85 });
  energy
    .moveTo(0, 16)
    .lineTo(20, 23)
    .lineTo(38, 23)
    .lineTo(58, 16)
    .lineTo(76, 16)
    .lineTo(98, 9)
    .lineTo(114, 9)
    .lineTo(128, 16)
    .stroke({ width: 1.2, color: 0xffffff, alpha: 0.65 });
  energy
    .rect(12, 3, 16, 1.5)
    .rect(86, 28, 18, 1.5)
    .fill({ color: 0xffffff, alpha: 0.5 });
  const railBurst = new Graphics()
    .star(0, 0, 8, 28, 7)
    .fill({ color: 0x268aff, alpha: 0.5 })
    .star(0, 0, 4, 19, 5)
    .fill(0x6deaff)
    .circle(0, 0, 5)
    .fill(0xffffff);
  const railScorch = new Graphics()
    .poly([0, -2, 36, -1, 76, -2, 128, 0, 92, 2, 44, 1, 0, 2])
    .fill(0xffffff);

  const casings = Object.fromEntries(
    Object.values(CASINGS).map((c) => [c.id, loaded[c.sprite]]),
  ) as Record<CasingId, Texture>;

  // Jagged concrete crumbs with an ink outline, a few pixels across.
  const wallChunks = Array.from({ length: 4 }, () => {
    const points: number[] = [];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = rand(1.6, 3);
      points.push(Math.cos(a) * d, Math.sin(a) * d);
    }
    return make(
      new Graphics()
        .poly(points)
        .fill(WALL_CHUNK)
        .stroke({ color: INK, width: 1, alignment: 0 }),
    );
  });

  // Smooth blood blobs: a darker rim around a lighter body (both multiply with the stamp tint),
  // plus a few round droplets thrown further out.
  const splats = Array.from({ length: 4 }, () => {
    const lobes: [number, number, number][] = [[0, 0, rand(14, 18)]];
    const count = Math.floor(rand(5, 9));
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(8, 20);
      lobes.push([Math.cos(a) * d, Math.sin(a) * d, rand(5, 10)]);
    }
    const drops: [number, number, number][] = [];
    const dropCount = Math.floor(rand(3, 7));
    for (let i = 0; i < dropCount; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(26, 38);
      drops.push([Math.cos(a) * d, Math.sin(a) * d, rand(1.8, 3.6)]);
    }
    const g = new Graphics();
    const RIM = 2.2;
    for (const [x, y, r] of [...lobes, ...drops])
      g.circle(x, y, r + RIM).fill(0x8a8a8a);
    for (const [x, y, r] of lobes) g.circle(x, y, r).fill(0xffffff);
    for (const [x, y, r] of drops) g.circle(x, y, r * 0.55).fill(0xd8d8d8);
    return make(g);
  });

  // Explosion parts are drawn at BLAST_TEXTURE_RADIUS and scaled to each blast's size by Effects.
  const R = BLAST_TEXTURE_RADIUS;
  // Round vector fireball: ink, orange, yellow, white core, each a lumpy ring of spikes.
  const boom = new Graphics();
  const spikes = 11;
  const ball = (outer: number, inner: number, color: number) => {
    const points: number[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const d = i % 2 === 0 ? outer : inner;
      points.push(Math.cos(a) * d, Math.sin(a) * d);
    }
    boom.poly(points).fill(color);
  };
  ball(R, R * 0.78, INK);
  ball(R * 0.9, R * 0.68, 0xff7a1a);
  ball(R * 0.66, R * 0.5, 0xffd23a);
  boom.circle(0, 0, R * 0.32).fill(0xfff6e0);
  // Shockwave: a white band with soft inner and outer edges.
  const ring = new Graphics();
  [0.2, 0.5, 1, 1, 0.5, 0.2].forEach((alpha, i) =>
    ring
      .circle(0, 0, R - 3 * i)
      .stroke({ width: 3, color: 0xffffff, alpha, alignment: 1 }),
  );
  const glow = new Graphics();
  for (let i = 8; i >= 1; i--)
    glow.circle(0, 0, (R * i) / 8).fill({ color: 0xffffff, alpha: 0.14 });
  // Scorches, white with alpha so the stamp tint sets the colour: a lumpy char blob darkest in the
  // middle, tapered rays blasted outward from it, and soot spatter thrown past their tips.
  const scorches = Array.from({ length: 4 }, () => {
    const g = new Graphics();
    const rays = 14 + Math.floor(rand(0, 9));
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + rand(-0.18, 0.18);
      const half = rand(0.05, 0.13);
      const base = R * 0.32;
      const tip = rand(0.55, 0.98) * R;
      g.poly([
        Math.cos(a - half) * base,
        Math.sin(a - half) * base,
        Math.cos(a) * tip,
        Math.sin(a) * tip,
        Math.cos(a + half) * base,
        Math.sin(a + half) * base,
      ]).fill({ color: 0xffffff, alpha: rand(0.4, 0.75) });
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(0.45, 0.95) * R;
      g.circle(Math.cos(a) * d, Math.sin(a) * d, rand(1.5, 4.5)).fill({
        color: 0xffffff,
        alpha: rand(0.5, 0.9),
      });
    }
    const lobes: [number, number, number][] = [[0, 0, R * 0.4]];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rand(-0.4, 0.4);
      const d = rand(0.2, 0.34) * R;
      lobes.push([Math.cos(a) * d, Math.sin(a) * d, rand(0.14, 0.24) * R]);
    }
    for (const [x, y, r] of lobes)
      g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.55 });
    for (const [x, y, r] of lobes)
      g.circle(x * 0.6, y * 0.6, r * 0.6).fill({ color: 0xffffff, alpha: 0.7 });
    g.circle(0, 0, R * 0.16).fill(0xffffff);
    return make(g, 1);
  });

  return {
    zombies,
    loot: Object.fromEntries(
      Object.entries(LOOT_SPRITES).map(([id, key]) => [id, loaded[key]]),
    ) as GameTextures["loot"],
    powerupIcons: Object.fromEntries(
      POWERUP_DEFS.map((d) => [d.id, loaded[d.icon]]),
    ),
    blast: {
      boom: make(boom),
      ring: make(ring),
      glow: make(glow, 1),
      scorches,
    },
    player: sprite("player"),
    playerFlash: sprite("playerFlash"),
    playerCorpse: sprite("playerCorpse"),
    weapons,
    muzzleFlash: make(flash),
    tracer: make(tracer, 1),
    rail: {
      glow: make(railGlow, 1),
      energy: make(energy, 1),
      burst: make(railBurst),
      scorch: make(railScorch, 1),
    },
    spark: make(spark),
    splats,
    casings,
    wallChunks,
    tiles: {
      concrete: sprite("tileConcrete"),
      wall: sprite("tileWall"),
    },
  };
}

/** Raw red flesh along a torn edge, under an ink line so the cut reads as part of the drawing. */
const STUMP_FLESH = 0x6e1c1c;
/** Stroke widths in source px for a torn edge, centred on the cut: half lands either side. */
const STUMP_FLESH_WIDTH = 16;
const STUMP_INK_WIDTH = 6;
/** Neck stump colours, sampled from the walker: shirt, its shadow, skin shadow; plus bone. */
const SHIRT = 0x4c6255;
const SHIRT_SHADE = 0x313e37;
const NECK_SKIN = 0x4f7648;
const BONE = 0xe8dfc4;
/** The sprites' outline weight in source px, for shapes drawn to sit among them. */
const OUTLINE_WIDTH = 5;
/** Cut edges are split every TEAR_STEP source px and alternate points pushed TEAR_DEPTH in or out. */
const TEAR_STEP = 5;
const TEAR_DEPTH = 2.5;

/**
 * Every combination of missing parts for the body, its flash and each corpse pose, plus each part
 * on its own. Built once at load by drawing the sprite, erasing the parts' outlines and capping the
 * wounds: a torn band along a cut, or a neck stump where a head was.
 */
function carveParts(
  renderer: Renderer,
  parts: NonNullable<ZombieArt["parts"]>,
  whole: ZombieLook,
  loaded: Record<string, Texture>,
): ZombieTextures {
  const torn = PART_IDS.map((id) => {
    const part = parts[id];
    return part
      ? {
          part,
          body: tornOutline(part.body),
          corpses: part.corpses.map(tornOutline),
        }
      : null;
  });
  const looks = [{ ...whole, opaque: opacityOf(renderer, whole.body) }];
  for (let mask = 1; mask < 1 << PART_IDS.length; mask++) {
    const gone = torn.filter((t, bit) => t && mask & (1 << bit)).map((t) => t!);
    // Pose -1 is the standing body; the rest index the corpse poses.
    const cuts = (pose: number): Cuts => {
      const at = <T>(body: T, corpses: readonly T[]) =>
        pose < 0 ? body : corpses[pose];
      return {
        erase: gone.map((t) => at(t.body, t.corpses)),
        bands: gone
          .filter((t) => !t.part.neck)
          .map((t) => at(t.body, t.corpses)),
        necks: gone.flatMap((t) =>
          t.part.neck ? [at(t.part.neck.body, t.part.neck.corpses)] : [],
        ),
      };
    };
    const body = carve(renderer, whole.body, cuts(-1), false);
    looks.push({
      body,
      opaque: opacityOf(renderer, body),
      flash: carve(renderer, whole.flash, cuts(-1), true),
      corpses: whole.corpses.map((pose, i) =>
        carve(renderer, pose, cuts(i), false),
      ),
    });
  }
  return {
    looks,
    parts: torn.map((t) => {
      if (!t) return null;
      if (!t.part.pieces) return sever(renderer, whole.body, t.body);
      const box = bounds(t.body.points);
      return {
        textures: t.part.pieces.map((path) => loaded[path]),
        x: (box.x + box.width / 2) * ART_SCALE,
        y: (box.y + box.height / 2) * ART_SCALE,
        rotation: Math.PI / 2,
      };
    }),
  };
}

/** What to do to a sprite for one set of missing parts, in its source pixels. */
interface Cuts {
  erase: Torn[];
  /** Cuts that get a torn flesh band. */
  bands: Torn[];
  necks: NeckCap[];
}

/** Read a texture back once at load and keep which of its source pixels are more than half opaque. */
function opacityOf(renderer: Renderer, texture: Texture): OpacityMask {
  const { pixels, width, height } = renderer.extract.pixels(texture);
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i++)
    solid[i] = pixels[i * 4 + 3] > 127 ? 1 : 0;
  return { width, height, solid };
}

/** A part's region as flat source-px points, and the stretch of it that tears from the body. */
interface Torn {
  points: number[];
  /** Polyline the stump band follows; the whole ring for a circle. */
  cut: number[];
  closed: boolean;
}

/** A part outline with a ragged edge, so cuts read torn rather than clipped. */
function tornOutline(shape: PartShape): Torn {
  const points: number[] = [];
  // Deterministic wobble so the stump and the flying piece share one edge.
  const offset = (i: number) =>
    (i % 2 ? 1 : -1) * TEAR_DEPTH * (0.4 + 0.6 * (((i * 7) % 5) / 4));
  if ("circle" in shape) {
    const [cx, cy, r] = shape.circle;
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / TEAR_STEP));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = r + offset(i) / 2;
      points.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    }
    return { points, cut: points, closed: true };
  }
  const p = shape.poly;
  let cutLength = 0;
  let i = 0;
  for (let v = 0; v < p.length; v += 2) {
    // The cut ends on the corner that starts the first edge past it.
    if (v / 2 === shape.cut) cutLength = points.length + 2;
    const x0 = p[v];
    const y0 = p[v + 1];
    const dx = p[(v + 2) % p.length] - x0;
    const dy = p[(v + 3) % p.length] - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.round(len / TEAR_STEP));
    for (let k = 0; k < steps; k++, i++) {
      const t = k / steps;
      // Corners stay put so the outline keeps the shape it was drawn with.
      const o = k === 0 ? 0 : offset(i);
      points.push(x0 + dx * t - (dy / len) * o, y0 + dy * t + (dx / len) * o);
    }
  }
  return { points, cut: points.slice(0, cutLength), closed: false };
}

/**
 * The sprite plus a flesh-and-ink band along each cut, clipped to its silhouette.
 * Destroy `band` once the root is baked.
 */
function withStumps(
  renderer: Renderer,
  source: Texture,
  outlines: Torn[],
): { root: Container; band: Texture | null } {
  const root = new Container();
  root.addChild(new Sprite(source));
  if (outlines.length === 0) return { root, band: null };
  const frame = new Rectangle(0, 0, source.width, source.height);
  // A sprite mask drifts and fades inside generateTexture, so clip the band by erasing it with
  // everything outside the silhouette instead.
  const outside = outsideOf(renderer, new Sprite(source), frame);
  const strokes = new Graphics();
  for (const { cut, closed } of outlines)
    strokes.poly(cut, closed).stroke({
      width: STUMP_FLESH_WIDTH,
      color: STUMP_FLESH,
      join: "round",
      cap: "round",
    });
  for (const { cut, closed } of outlines)
    strokes.poly(cut, closed).stroke({
      width: STUMP_INK_WIDTH,
      color: INK,
      join: "round",
      cap: "round",
    });
  strokes.scale.set(ART_SCALE);
  const clip = new Sprite(outside);
  clip.blendMode = "erase";
  const bandRoot = new Container();
  bandRoot.addChild(strokes, clip);
  const band = bake(renderer, bandRoot, frame);
  outside.destroy(true);
  root.addChild(new Sprite(band));
  return { root, band };
}

/**
 * `source` with the cuts erased and their wounds capped, at the source's own size so anchors keep
 * working. The flash gets no bands and a white neck, so it stays a plain silhouette.
 */
function carve(
  renderer: Renderer,
  source: Texture,
  cuts: Cuts,
  flash: boolean,
): Texture {
  const { root, band } = withStumps(renderer, source, flash ? [] : cuts.bands);
  const cut = new Graphics();
  for (const { points } of cuts.erase) cut.poly(points).fill(0xffffff);
  cut.scale.set(ART_SCALE);
  cut.blendMode = "erase";
  const necks = new Graphics();
  for (const cap of cuts.necks) drawNeck(necks, cap, flash);
  necks.scale.set(ART_SCALE);
  root.addChild(cut, necks);
  const texture = bake(
    renderer,
    root,
    new Rectangle(0, 0, source.width, source.height),
  );
  band?.destroy(true);
  return texture;
}

/** Top-down neck stump: the upper back it sat on (if any), torn skin, raw flesh and a bone nub. */
function drawNeck(g: Graphics, cap: NeckCap, flash: boolean): void {
  const c = (color: number) => (flash ? 0xffffff : color);
  const { x, y, r } = cap;
  if (cap.back) {
    g.circle(x, y, cap.back)
      .fill(c(SHIRT_SHADE))
      .circle(x + 1.5, y - 1, cap.back - 3.5)
      .fill(c(SHIRT))
      .circle(x, y, cap.back)
      .stroke({ width: OUTLINE_WIDTH, color: c(INK) });
  }
  const ring = (radius: number) =>
    tornOutline({ circle: [x, y, radius] }).points;
  g.poly(ring(r))
    .fill(c(NECK_SKIN))
    .stroke({ width: 3, color: c(INK), join: "round" })
    .poly(ring(r * 0.68))
    .fill(c(STUMP_FLESH))
    .circle(x + r * 0.08, y, r * 0.3)
    .fill(c(BONE))
    .stroke({ width: 1.5, color: c(INK) });
}

/** Everything outside the outline erased, cropped to the outline's bounds. */
function sever(renderer: Renderer, source: Texture, torn: Torn): SeveredPart {
  const { root, band } = withStumps(renderer, source, [torn]);
  const w = source.width / ART_SCALE;
  const h = source.height / ART_SCALE;
  const shape = new Graphics().poly(torn.points).fill(0xffffff);
  shape.scale.set(ART_SCALE);
  const outside = outsideOf(
    renderer,
    shape,
    new Rectangle(0, 0, source.width, source.height),
  );
  const keep = new Sprite(outside);
  keep.blendMode = "erase";
  root.addChild(keep);
  const box = bounds(torn.points);
  // Whole source pixels, clamped to the sprite, so the crop lands on texel edges.
  const minX = Math.max(0, Math.floor(box.x));
  const minY = Math.max(0, Math.floor(box.y));
  const maxX = Math.min(w, Math.ceil(box.x + box.width));
  const maxY = Math.min(h, Math.ceil(box.y + box.height));
  const frame = new Rectangle(
    minX * ART_SCALE,
    minY * ART_SCALE,
    (maxX - minX) * ART_SCALE,
    (maxY - minY) * ART_SCALE,
  );
  const texture = bake(renderer, root, frame);
  band?.destroy(true);
  outside.destroy(true);
  return {
    textures: [texture],
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
    rotation: 0,
  };
}

/** Bounding box of flat x,y points. */
function bounds(points: number[]): Rectangle {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}

/** White everywhere in `frame` that `shape` doesn't cover; erasing with it keeps only the shape. */
function outsideOf(
  renderer: Renderer,
  shape: Container,
  frame: Rectangle,
): Texture {
  shape.blendMode = "erase";
  const root = new Container();
  root.addChild(
    new Graphics()
      .rect(frame.x, frame.y, frame.width, frame.height)
      .fill(0xffffff),
    shape,
  );
  return bake(renderer, root, frame);
}

function bake(renderer: Renderer, root: Container, frame: Rectangle): Texture {
  const texture = renderer.generateTexture({
    target: root,
    frame,
    antialias: true,
    resolution: ART_RESOLUTION,
    textureSourceOptions: { scaleMode: SCALE_MODE },
  });
  root.destroy({ children: true });
  return texture;
}

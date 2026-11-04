import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  type Renderer,
} from "pixi.js";
import { CASINGS, type CasingId } from "../config/casings";
import type { LootId } from "../config/loot";
import type { PowerupId } from "../config/powerups";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { ZOMBIES, type ZombieArt } from "../config/zombies";
import { rand } from "../core/random";

export interface ZombieTextures {
  body: Texture;
  /** White silhouette of the body, swapped in for the hit flash. */
  flash: Texture;
  /** Lying-down poses, one picked at random per death. */
  corpses: Texture[];
}

export interface GameTextures {
  /** Sprite sets by ZombieArt key. */
  zombies: Record<string, ZombieTextures>;
  player: Texture;
  /** Held weapon art by weapon id, from each WeaponDef's sprite path. */
  weapons: Record<string, Texture>;
  muzzleFlash: Texture;
  /** Soft-edged band stretched along each hitscan shot. */
  tracer: Texture;
  spark: Texture;
  splats: Texture[];
  casings: Record<CasingId, Texture>;
  /** Repeating floor and wall tiles. */
  tiles: { concrete: Texture; wall: Texture };
  /** Pickup sprites. All loot shares one texture source so a ParticleContainer can draw it in one call. */
  loot: Record<LootId, Texture>;
  crate: Texture;
  weaponIcons: Record<WeaponId, Texture>;
  /** Glowing orb that carries a power-up, with an icon per kind. */
  orb: Texture;
  powerupIcons: Record<PowerupId, Texture>;
}

const SPRITES = {
  player: "/sprites/player.png",
  tileConcrete: "/sprites/tile-concrete.png",
  tileWall: "/sprites/tile-wall.png",
  crate: "/sprites/drop-crate.png",
  orb: "/sprites/powerup-orb.png",
} as const;

const LOOT_SPRITES: Record<LootId, string> = {
  coin: "/sprites/loot-coin.png",
  gem: "/sprites/loot-gem.png",
  bigGem: "/sprites/loot-big-gem.png",
};

const POWERUP_ICON_SPRITES: Record<PowerupId, string> = {
  magnet: "/sprites/icon-powerup-magnet.png",
  rapidFire: "/sprites/icon-powerup-rapid.png",
  doubleDamage: "/sprites/icon-powerup-damage.png",
  speed: "/sprites/icon-powerup-speed.png",
};

const ICON_SPRITES: Record<WeaponId, string> = {
  pistol: "/sprites/icon-pistol.png",
  rifle: "/sprites/icon-rifle.png",
  shotgun: "/sprites/icon-shotgun.png",
  railgun: "/sprites/icon-railgun.png",
  minigun: "/sprites/icon-minigun.png",
  magnum: "/sprites/icon-magnum.png",
  uzi: "/sprites/icon-uzi.png",
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

/** Outline colour shared with the sprite art, for anything drawn here that needs an edge. */
const INK = 0x151a15;

/**
 * Character, weapon, pickup and tile art is flat vector-style sprites from /public/sprites.
 * Effects (splats, sparks, muzzle flash, tracer, casings) are drawn here as vector shapes at
 * full resolution so they match.
 */
export async function createTextures(
  renderer: Renderer,
): Promise<GameTextures> {
  const weaponDefs = Object.values(WEAPONS);
  const zombieArts = [
    ...new Map(Object.values(ZOMBIES).map((z) => [z.art.key, z.art])).values(),
  ];
  const zombiePaths = (art: ZombieArt) => ({
    body: `/sprites/zombie-${art.key}.png`,
    flash: `/sprites/zombie-${art.key}-flash.png`,
    corpses: art.corpses.map(
      (n) => `/sprites/zombie-${art.key}-corpse-${n}.png`,
    ),
  });
  const urls = [
    ...Object.values(SPRITES),
    ...weaponDefs.map((w) => w.sprite.path),
    ...zombieArts.flatMap((art) => {
      const paths = zombiePaths(art);
      return [paths.body, paths.flash, ...paths.corpses];
    }),
    ...Object.values(LOOT_SPRITES),
    ...Object.values(ICON_SPRITES),
    ...Object.values(POWERUP_ICON_SPRITES),
  ];
  const loaded = (await Assets.load<Texture>(
    urls.map((src) => ({
      alias: src,
      src,
      data: { resolution: ART_RESOLUTION, scaleMode: SCALE_MODE },
    })),
  )) as unknown as Record<string, Texture>;
  const sprite = (key: keyof typeof SPRITES) => loaded[SPRITES[key]];
  const weapons = Object.fromEntries(
    weaponDefs.map((w) => [w.id, loaded[w.sprite.path]]),
  );
  const zombies = Object.fromEntries(
    zombieArts.map((art) => {
      const paths = zombiePaths(art);
      return [
        art.key,
        {
          body: loaded[paths.body],
          flash: loaded[paths.flash],
          corpses: paths.corpses.map((path) => loaded[path]),
        },
      ];
    }),
  );
  const icons = Object.fromEntries(
    Object.entries(ICON_SPRITES).map(([id, url]) => [id, loaded[url]]),
  ) as Record<WeaponId, Texture>;

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
  burst(70, 12, INK);
  burst(62, 9, 0xff7a1a);
  burst(46, 7, 0xffd23a);
  flash.circle(6, 0, 8).fill(0xffffff);

  // Soft-edged band for tracers: opaque core, fading rows above and below. Stretched to length.
  const tracer = new Graphics();
  [0.15, 0.45, 0.85, 1, 1, 0.85, 0.45, 0.15].forEach((alpha, row) =>
    tracer.rect(0, row - 4, 2, 1).fill({ color: 0xffffff, alpha }),
  );

  // Casings are tiny, so they're baked at a higher resolution: a rounded shell, rim and glint.
  const casings = Object.fromEntries(
    Object.entries(CASINGS).map(([id, def]) => {
      const { width: w, height: h } = def;
      const g = new Graphics()
        .roundRect(-w / 2, -h / 2, w, h, h * 0.45)
        .fill(def.color)
        .stroke({ width: 0.7, color: INK })
        .roundRect(-w / 2, -h / 2, Math.max(1.5, w * 0.25), h, h * 0.3)
        .fill(def.baseColor)
        .stroke({ width: 0.7, color: INK })
        .rect(-w / 2 + w * 0.3, -h / 2 + h * 0.22, w * 0.55, h * 0.18)
        .fill({ color: 0xffffff, alpha: 0.55 });
      return [id, make(g, 4)];
    }),
  ) as Record<CasingId, Texture>;

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

  return {
    zombies,
    loot: packAtlas(renderer, LOOT_SPRITES, loaded),
    crate: sprite("crate"),
    orb: sprite("orb"),
    powerupIcons: Object.fromEntries(
      Object.entries(POWERUP_ICON_SPRITES).map(([id, url]) => [
        id,
        loaded[url],
      ]),
    ) as Record<PowerupId, Texture>,
    weaponIcons: icons,
    player: sprite("player"),
    weapons,
    muzzleFlash: make(flash),
    tracer: make(tracer, 1),
    spark: make(spark),
    splats,
    casings,
    tiles: {
      concrete: sprite("tileConcrete"),
      wall: sprite("tileWall"),
    },
  };
}

/** Lay separate images side by side in one texture and hand back a frame per key. */
function packAtlas<K extends string>(
  renderer: Renderer,
  urls: Record<K, string>,
  loaded: Record<string, Texture>,
): Record<K, Texture> {
  const sheet = new Container();
  const frames = {} as Record<K, Rectangle>;
  let x = 0;
  for (const key of Object.keys(urls) as K[]) {
    const s = new Sprite(loaded[urls[key]]);
    s.x = x;
    sheet.addChild(s);
    frames[key] = new Rectangle(x, 0, s.width, s.height);
    // A gap so filtering never bleeds a neighbour's edge in.
    x += s.width + 2;
  }
  const atlas = renderer.generateTexture({
    target: sheet,
    antialias: false,
    resolution: ART_RESOLUTION,
    textureSourceOptions: { scaleMode: SCALE_MODE },
  });
  sheet.destroy({ children: true });
  const out = {} as Record<K, Texture>;
  for (const key of Object.keys(frames) as K[])
    out[key] = new Texture({ source: atlas.source, frame: frames[key] });
  return out;
}

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
import type { WeaponId } from "../config/weapons";
import { rand } from "../core/random";

export interface GameTextures {
  zombie: Texture;
  /** White silhouette of the walker, swapped in for the hit flash. */
  zombieFlash: Texture;
  zombieCorpse: Texture;
  player: Texture;
  muzzleFlash: Texture;
  spark: Texture;
  splats: Texture[];
  casings: Record<CasingId, Texture>;
  /** Repeating ground and wall tiles. */
  tiles: { concrete: Texture; dirt: Texture; wall: Texture };
  /** Pickup sprites. All loot shares one texture source so a ParticleContainer can draw it in one call. */
  loot: Record<LootId, Texture>;
  crate: Texture;
  weaponIcons: Record<WeaponId, Texture>;
}

const SPRITES = {
  zombie: "/sprites/zombie-walker.png",
  zombieFlash: "/sprites/zombie-walker-flash.png",
  zombieCorpse: "/sprites/zombie-corpse.png",
  player: "/sprites/player.png",
  muzzleFlash: "/sprites/muzzle-flash.png",
  tileConcrete: "/sprites/tile-concrete.png",
  tileDirt: "/sprites/tile-dirt.png",
  tileWall: "/sprites/tile-wall.png",
  crate: "/sprites/drop-crate.png",
} as const;

const LOOT_SPRITES: Record<LootId, string> = {
  coin: "/sprites/loot-coin.png",
  gem: "/sprites/loot-gem.png",
  bigGem: "/sprites/loot-big-gem.png",
};

const ICON_SPRITES: Record<WeaponId, string> = {
  pistol: "/sprites/icon-pistol.png",
  rifle: "/sprites/icon-rifle.png",
  shotgun: "/sprites/icon-shotgun.png",
  railgun: "/sprites/icon-railgun.png",
  minigun: "/sprites/icon-minigun.png",
};

/** Procedural art is rendered at this fraction of world resolution so it reads as chunky pixels. */
const PIXEL_SCALE = 0.25;

/**
 * Character art is 8-bit pixel sprites from /public/sprites. Everything else is still generated
 * from vector shapes at low resolution with nearest filtering, so it sits in the same world.
 */
export async function createTextures(
  renderer: Renderer,
): Promise<GameTextures> {
  const loaded = await Assets.load<Texture>([
    ...Object.values(SPRITES),
    ...Object.values(LOOT_SPRITES),
    ...Object.values(ICON_SPRITES),
  ]);
  const sprite = (key: keyof typeof SPRITES) => pixelate(loaded[SPRITES[key]]);
  const icons = Object.fromEntries(
    Object.entries(ICON_SPRITES).map(([id, url]) => [
      id,
      pixelate(loaded[url]),
    ]),
  ) as Record<WeaponId, Texture>;

  const make = (g: Graphics) => {
    const texture = renderer.generateTexture({
      target: g,
      antialias: false,
      resolution: PIXEL_SCALE,
      textureSourceOptions: { scaleMode: "nearest" },
    });
    g.destroy();
    return pixelate(texture);
  };

  const spark = new Graphics().rect(-3, -3, 6, 6).fill(0xffffff);

  // Casings are a few pixels across, so they're drawn 1:1 rather than through the chunky downscale.
  const casings = Object.fromEntries(
    Object.entries(CASINGS).map(([id, def]) => {
      const { width: w, height: h } = def;
      const g = new Graphics()
        .rect(-w / 2, -h / 2, w, h)
        .fill(def.color)
        .rect(-w / 2, -h / 2, 1, h)
        .fill(def.baseColor);
      const texture = renderer.generateTexture({
        target: g,
        antialias: false,
        resolution: 1,
        textureSourceOptions: { scaleMode: "nearest" },
      });
      g.destroy();
      return [id, texture];
    }),
  ) as Record<CasingId, Texture>;

  const splats = Array.from({ length: 4 }, () => {
    const g = new Graphics().circle(0, 0, rand(14, 20)).fill(0xffffff);
    const blobs = Math.floor(rand(6, 12));
    for (let i = 0; i < blobs; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(8, 26);
      g.circle(Math.cos(a) * d, Math.sin(a) * d, rand(3, 9)).fill(0xffffff);
    }
    const drops = Math.floor(rand(4, 9));
    for (let i = 0; i < drops; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(24, 40);
      g.circle(Math.cos(a) * d, Math.sin(a) * d, rand(2, 4)).fill(0xffffff);
    }
    return make(g);
  });

  return {
    loot: packAtlas(renderer, LOOT_SPRITES, loaded),
    crate: sprite("crate"),
    weaponIcons: icons,
    zombie: sprite("zombie"),
    zombieFlash: sprite("zombieFlash"),
    zombieCorpse: sprite("zombieCorpse"),
    player: sprite("player"),
    muzzleFlash: sprite("muzzleFlash"),
    spark: make(spark),
    splats,
    casings,
    tiles: {
      concrete: sprite("tileConcrete"),
      dirt: sprite("tileDirt"),
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
    // A gap so nearest sampling never bleeds a neighbour's edge in.
    x += s.width + 2;
  }
  const atlas = renderer.generateTexture({
    target: sheet,
    antialias: false,
    resolution: 1,
    textureSourceOptions: { scaleMode: "nearest" },
  });
  sheet.destroy({ children: true });
  const out = {} as Record<K, Texture>;
  for (const key of Object.keys(frames) as K[])
    out[key] = new Texture({ source: atlas.source, frame: frames[key] });
  return out;
}

function pixelate(texture: Texture): Texture {
  texture.source.scaleMode = "nearest";
  return texture;
}

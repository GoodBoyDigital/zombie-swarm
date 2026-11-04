import { Assets, Graphics, type Renderer, type Texture } from "pixi.js";
import { CASINGS, type CasingId } from "../config/casings";
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
} as const;

/** Procedural art is rendered at this fraction of world resolution so it reads as chunky pixels. */
const PIXEL_SCALE = 0.25;

/**
 * Character art is 8-bit pixel sprites from /public/sprites. Everything else is still generated
 * from vector shapes at low resolution with nearest filtering, so it sits in the same world.
 */
export async function createTextures(
  renderer: Renderer,
): Promise<GameTextures> {
  const loaded = await Assets.load<Texture>(Object.values(SPRITES));
  const sprite = (key: keyof typeof SPRITES) => pixelate(loaded[SPRITES[key]]);

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

function pixelate(texture: Texture): Texture {
  texture.source.scaleMode = "nearest";
  return texture;
}

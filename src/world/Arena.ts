import { Container, Graphics, TilingSprite } from "pixi.js";
import { ARENA, GATES, type Side } from "../config/arena";
import type { GameTextures } from "../fx/textures";

export interface Gate {
  side: Side;
  /** Point just outside the wall where zombies spawn around. */
  spawn: { x: number; y: number };
  /** Point just inside the arena zombies steer to before chasing the player. */
  entry: { x: number; y: number };
  /** Spawn jitter along the gate's length. */
  halfWidth: number;
}

const INK = 0x151a15;
const HAZARD_YELLOW = 0xf2c230;
const HAZARD_DARK = 0x2b2a26;
/** Length of each hazard stripe along a barricade, px. */
const STRIPE = 14;
const POST = 0x8a8f8c;
const POST_RADIUS = 8;

/** Static walls and gates. Also owns the player-clamp rectangle. */
export class Arena {
  readonly view = new Container();
  readonly gates: Gate[];
  /** Rect the player is confined to. */
  readonly bounds = {
    minX: 0,
    minY: 0,
    maxX: ARENA.width,
    maxY: ARENA.height,
  };

  constructor(tex: GameTextures) {
    this.gates = GATES.map((side) => this.describeGate(side));
    this.view.addChild(this.drawWalls(tex));
  }

  isInside(x: number, y: number, pad = 0): boolean {
    return (
      x > -pad && y > -pad && x < ARENA.width + pad && y < ARENA.height + pad
    );
  }

  private describeGate(side: Side): Gate {
    const { width: w, height: h, wallThickness: t, gateWidth, margin } = ARENA;
    const half = gateWidth / 2;
    const out = t + margin * 0.6;
    switch (side) {
      case "left":
        return {
          side,
          spawn: { x: -out, y: h / 2 },
          entry: { x: 40, y: h / 2 },
          halfWidth: half,
        };
      case "right":
        return {
          side,
          spawn: { x: w + out, y: h / 2 },
          entry: { x: w - 40, y: h / 2 },
          halfWidth: half,
        };
      case "top":
        return {
          side,
          spawn: { x: w / 2, y: -out },
          entry: { x: w / 2, y: 40 },
          halfWidth: half,
        };
      case "bottom":
        return {
          side,
          spawn: { x: w / 2, y: h + out },
          entry: { x: w / 2, y: h - 40 },
          halfWidth: half,
        };
    }
  }

  private drawWalls(tex: GameTextures): Container {
    const { width: w, height: h, wallThickness: t, gateWidth } = ARENA;
    const walls = new Container();
    const g = new Graphics();
    const open = new Set(GATES);
    const half = gateWidth / 2;

    // Each wall run is a block tile strip with a light bevel just inside a heavy ink outline,
    // so the top edge reads as raised above the floor.
    const segment = (x: number, y: number, sw: number, sh: number) => {
      const blocks = new TilingSprite({
        texture: tex.tiles.wall,
        width: sw,
        height: sh,
      });
      blocks.position.set(x, y);
      walls.addChild(blocks);
      g.rect(x + 3, y + 3, sw - 6, sh - 6).stroke({
        width: 2,
        color: 0xffffff,
        alpha: 0.18,
      });
      g.rect(x, y, sw, sh).stroke({ width: 4, color: INK });
    };

    // Horizontal walls (top / bottom), split around a gate if one is open.
    for (const [y, side] of [
      [-t, "top"],
      [h, "bottom"],
    ] as const) {
      if (open.has(side)) {
        segment(-t, y, w / 2 - half + t, t);
        segment(w / 2 + half, y, w / 2 - half + t, t);
      } else {
        segment(-t, y, w + t * 2, t);
      }
    }
    for (const [x, side] of [
      [-t, "left"],
      [w, "right"],
    ] as const) {
      if (open.has(side)) {
        segment(x, 0, t, h / 2 - half);
        segment(x, h / 2 + half, t, h / 2 - half);
      } else {
        segment(x, 0, t, h);
      }
    }

    // Low hazard-striped barricade across each gate: zombies step over it, the player can't.
    // Posts cap the wall ends either side so each opening reads at a glance.
    const barricade = (x: number, y: number, bw: number, bh: number) => {
      const along = bw > bh;
      const length = along ? bw : bh;
      g.rect(x, y, bw, bh).fill(HAZARD_YELLOW);
      for (let d = 0; d < length; d += STRIPE * 2) {
        const run = Math.min(STRIPE, length - d);
        if (along) g.rect(x + d, y, run, bh).fill(HAZARD_DARK);
        else g.rect(x, y + d, bw, run).fill(HAZARD_DARK);
      }
      g.rect(x, y, bw, bh).stroke({ width: 3, color: INK });
      const [ax, ay, bx, by] = along
        ? [x, y + bh / 2, x + bw, y + bh / 2]
        : [x + bw / 2, y, x + bw / 2, y + bh];
      for (const [px, py] of [
        [ax, ay],
        [bx, by],
      ])
        g.circle(px, py, POST_RADIUS)
          .fill(POST)
          .stroke({ width: 3, color: INK })
          .circle(px - 1.5, py - 1.5, POST_RADIUS * 0.45)
          .fill({ color: 0xffffff, alpha: 0.3 });
    };
    for (const side of open) {
      if (side === "top") barricade(w / 2 - half, -8, gateWidth, 8);
      if (side === "bottom") barricade(w / 2 - half, h, gateWidth, 8);
      if (side === "left") barricade(-8, h / 2 - half, 8, gateWidth);
      if (side === "right") barricade(w, h / 2 - half, 8, gateWidth);
    }
    walls.addChild(g);
    return walls;
  }
}

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

    // Each wall run is a brick tile strip with a dark edge so it reads as raised.
    const segment = (x: number, y: number, sw: number, sh: number) => {
      const bricks = new TilingSprite({
        texture: tex.tiles.wall,
        width: sw,
        height: sh,
      });
      bricks.position.set(x, y);
      walls.addChild(bricks);
      g.rect(x, y, sw, sh).stroke({ width: 2, color: 0x0d0b09 });
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

    // Low barricade across each gate: zombies step over it, the player can't.
    const barricade = 0x7a5a2e;
    for (const side of open) {
      if (side === "top")
        g.rect(w / 2 - half, -8, gateWidth, 8).fill(barricade);
      if (side === "bottom")
        g.rect(w / 2 - half, h, gateWidth, 8).fill(barricade);
      if (side === "left")
        g.rect(-8, h / 2 - half, 8, gateWidth).fill(barricade);
      if (side === "right")
        g.rect(w, h / 2 - half, 8, gateWidth).fill(barricade);
    }
    walls.addChild(g);
    return walls;
  }
}

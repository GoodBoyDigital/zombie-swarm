import { Container, Graphics, Sprite } from "pixi.js";
import { POWERUP_CATEGORIES } from "../config/powerups";
import type { GameTextures } from "../fx/textures";
import type { ActivePowerup } from "../powerups/PowerupContext";

const WIDTH = 110;
const HEIGHT = 22;
const OUTLINE = 3;
/** Icon disc at the pill's left end, a little taller than the pill. */
const DISC = 18;
const GAP = 12;
const BACK = 0x2a1f1a;
const INK = 0x14100d;
/** Last seconds the pill blinks before the effect runs out. */
const BLINK_SECONDS = 3;

interface Pill {
  view: Container;
  bar: Graphics;
  disc: Graphics;
  icon: Sprite;
}

/** One flat-vector pill per running timed power-up: its icon on a coloured disc and a bar that drains. */
export class PowerupPills {
  readonly view = new Container({ label: "powerupPills" });
  private readonly pills: Pill[] = [];

  constructor(private readonly tex: GameTextures) {}

  update(active: readonly ActivePowerup[]): void {
    let shown = 0;
    for (const a of active) {
      if (a.def.mode !== "timed") continue;
      const pill = this.pills[shown] ?? this.create();
      pill.view.visible = true;
      pill.view.x = shown * (WIDTH + DISC + GAP);
      this.draw(pill, a, a.left / a.def.seconds);
      shown++;
    }
    for (let i = shown; i < this.pills.length; i++)
      this.pills[i].view.visible = false;
  }

  private draw(pill: Pill, a: ActivePowerup, fraction: number): void {
    const color = POWERUP_CATEGORIES[a.def.category].color;
    const inner = HEIGHT - OUTLINE * 2;
    const x0 = DISC;
    const barW =
      (WIDTH - OUTLINE * 2 - DISC) * Math.max(0, Math.min(1, fraction));
    const g = pill.bar.clear();
    g.roundRect(0, -HEIGHT / 2, WIDTH, HEIGHT, HEIGHT / 2)
      .fill(BACK)
      .stroke({ width: OUTLINE, color: INK, alignment: 1 });
    if (barW > 0) {
      g.roundRect(x0, -inner / 2, barW, inner, inner / 2).fill(color);
      g.roundRect(
        x0 + 2,
        -inner / 2 + 2,
        Math.max(0, barW - 4),
        inner * 0.3,
        2,
      ).fill({
        color: 0xffffff,
        alpha: 0.35,
      });
    }
    pill.disc
      .clear()
      .circle(0, 0, DISC)
      .fill(color)
      .stroke({ width: OUTLINE, color: INK, alignment: 1 });
    const t = (pill.icon.texture = this.tex.powerupIcons[a.def.id]);
    pill.icon.scale.set((DISC * 1.5) / Math.max(t.width, t.height));
    pill.view.alpha = a.left < BLINK_SECONDS && (a.left * 6) % 2 < 1 ? 0.45 : 1;
  }

  private create(): Pill {
    const view = new Container();
    const bar = new Graphics();
    const disc = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    view.addChild(bar, disc, icon);
    this.view.addChild(view);
    const pill = { view, bar, disc, icon };
    this.pills.push(pill);
    return pill;
  }
}

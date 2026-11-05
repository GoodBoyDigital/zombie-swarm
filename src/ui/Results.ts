import { Container, Graphics, Text, type Application } from "pixi.js";
import { UI_FONT } from "./font";
import { formatTime } from "./RunHud";

const DIM = 0x000000;
const DIM_ALPHA = 0.6;
const DIED = 0xd93a2b;
const WON = 0x7dff6a;
const INK = 0xf0ead8;
const GOLD = 0xf2c230;
const BUTTON = 0x7a5a2e;
const BUTTON_HOVER = 0x9a7a3e;
const BUTTON_EDGE = 0x0d0b09;
const BUTTON_W = 220;
const BUTTON_H = 52;
const BUTTON_GAP = 24;

export interface RunResult {
  extracted: boolean;
  /** Level name as shown, e.g. "Level 2". */
  level: string;
  seconds: number;
  kills: number;
  coins: number;
  /** The bank after this run's coins went in. */
  bankTotal: number;
  /** Longest this level has been survived, this run included. */
  bestSeconds: number;
  /** False after the last level, so there's nothing to move on to. */
  hasNext: boolean;
}

/** Screen-space end card: the outcome, the run's numbers, coins banked, and Retry / Next level. */
export class Results {
  readonly view = new Container({ label: "results" });
  private readonly dim = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly stats: Text;
  private readonly bank: Text;
  private readonly best: Text;
  private readonly hint: Text;
  private readonly retry: Container;
  private readonly next: Container;

  constructor(
    private readonly app: Application,
    onRetry: () => void,
    onNext: () => void,
  ) {
    this.title = new Text({ text: "", style: style(56, DIED) });
    this.subtitle = new Text({ text: "", style: style(24, INK) });
    this.stats = new Text({ text: "", style: style(22, INK) });
    this.bank = new Text({ text: "", style: style(22, GOLD) });
    this.best = new Text({ text: "", style: style(15, INK) });
    this.hint = new Text({ text: "", style: style(16, INK) });
    this.retry = button("RETRY", onRetry);
    this.next = button("NEXT LEVEL", onNext);
    for (const t of [
      this.title,
      this.subtitle,
      this.stats,
      this.bank,
      this.best,
      this.hint,
    ])
      t.anchor.set(0.5);
    this.view.addChild(
      this.dim,
      this.title,
      this.subtitle,
      this.stats,
      this.bank,
      this.best,
      this.retry,
      this.next,
      this.hint,
    );
    this.view.visible = false;
    app.renderer.on("resize", () => this.layout());
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** Whether the card offers the next level, for the N key. */
  get offersNext(): boolean {
    return this.view.visible && this.next.visible;
  }

  show(r: RunResult): void {
    const level = r.level.toUpperCase();
    this.title.text = r.extracted ? `${level} COMPLETE` : "YOU DIED";
    this.title.style.fill = r.extracted ? WON : DIED;
    this.subtitle.text = r.extracted
      ? r.hasNext
        ? "EXTRACTED · NEXT LEVEL UNLOCKED"
        : "EXTRACTED · ALL LEVELS CLEARED"
      : level;
    this.stats.text = `TIME ${formatTime(r.seconds)} · ${r.kills.toLocaleString("en-US")} KILLS`;
    this.bank.text = `+${r.coins.toLocaleString("en-US")} COINS BANKED · TOTAL ${r.bankTotal.toLocaleString("en-US")}`;
    this.best.text = `BEST ON ${level}: ${formatTime(r.bestSeconds)}`;
    this.next.visible = r.extracted && r.hasNext;
    this.hint.text = this.next.visible
      ? "N next level · R retry"
      : "press R to retry";
    this.layout();
    this.view.visible = true;
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    this.dim
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: DIM, alpha: DIM_ALPHA });
    const cx = width / 2;
    const cy = height / 2;
    this.title.position.set(cx, cy - 140);
    this.subtitle.position.set(cx, cy - 88);
    this.stats.position.set(cx, cy - 38);
    this.bank.position.set(cx, cy - 4);
    this.best.position.set(cx, cy + 28);
    // Next level leads when it's offered; Retry sits beside it.
    const offset = this.next.visible ? (BUTTON_W + BUTTON_GAP) / 2 : 0;
    this.next.position.set(cx - offset, cy + 90);
    this.retry.position.set(cx + offset, cy + 90);
    this.hint.position.set(cx, cy + 145);
  }
}

function style(size: number, fill: number) {
  return {
    ...UI_FONT,
    fontSize: size,
    fill,
    stroke: { color: 0x000000, width: size * 0.18 },
  };
}

function button(text: string, onClick: () => void): Container {
  const view = new Container({ label: text.toLowerCase() });
  const face = new Graphics();
  const paint = (color: number) =>
    face
      .clear()
      .rect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H)
      .fill(color)
      .stroke({ width: 3, color: BUTTON_EDGE });
  const label = new Text({ text, style: style(22, INK) });
  label.anchor.set(0.5);
  view.addChild(face, label);
  view.eventMode = "static";
  view.cursor = "pointer";
  paint(BUTTON);
  view.on("pointerover", () => paint(BUTTON_HOVER));
  view.on("pointerout", () => paint(BUTTON));
  view.on("pointerdown", onClick);
  return view;
}

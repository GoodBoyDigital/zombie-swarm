import { Container, Graphics, Text, type Application } from "pixi.js";

const DIM = 0x000000;
const DIM_ALPHA = 0.6;
const TITLE = 0xd93a2b;
const INK = 0xf0ead8;
const BUTTON = 0x7a5a2e;
const BUTTON_HOVER = 0x9a7a3e;
const BUTTON_EDGE = 0x0d0b09;
const BUTTON_W = 220;
const BUTTON_H = 52;

export interface RunStats {
  seconds: number;
  kills: number;
  coins: number;
}

/** Screen-space end card: the run's numbers, a Restart button and the R hint. */
export class GameOver {
  readonly view = new Container();
  private readonly dim = new Graphics();
  private readonly title: Text;
  private readonly stats: Text;
  private readonly button = new Container();
  private readonly buttonFace = new Graphics();
  private readonly hint: Text;

  constructor(
    private readonly app: Application,
    onRestart: () => void,
  ) {
    const mono = (size: number, fill: number) => ({
      fontFamily: "monospace",
      fontSize: size,
      fontWeight: "bold" as const,
      fill,
      stroke: { color: 0x000000, width: size * 0.18 },
    });
    this.title = new Text({ text: "YOU DIED", style: mono(56, TITLE) });
    this.stats = new Text({ text: "", style: mono(22, INK) });
    this.hint = new Text({ text: "press R to restart", style: mono(16, INK) });
    for (const t of [this.title, this.stats, this.hint]) t.anchor.set(0.5);
    const label = new Text({ text: "RESTART", style: mono(22, INK) });
    label.anchor.set(0.5);
    this.button.addChild(this.buttonFace, label);
    this.button.eventMode = "static";
    this.button.cursor = "pointer";
    this.paintButton(BUTTON);
    this.button.on("pointerover", () => this.paintButton(BUTTON_HOVER));
    this.button.on("pointerout", () => this.paintButton(BUTTON));
    this.button.on("pointerdown", onRestart);
    this.view.addChild(
      this.dim,
      this.title,
      this.stats,
      this.button,
      this.hint,
    );
    this.view.visible = false;
    app.renderer.on("resize", () => this.layout());
  }

  show(run: RunStats): void {
    const m = Math.floor(run.seconds / 60);
    const s = Math.floor(run.seconds % 60);
    const coins = run.coins.toLocaleString("en-US");
    this.stats.text = `YOU LASTED ${m}:${String(s).padStart(2, "0")} · ${run.kills} KILLS · ${coins} COINS`;
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
    this.title.position.set(cx, cy - 90);
    this.stats.position.set(cx, cy - 20);
    this.button.position.set(cx, cy + 50);
    this.hint.position.set(cx, cy + 105);
  }

  private paintButton(color: number): void {
    this.buttonFace
      .clear()
      .rect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H)
      .fill(color)
      .stroke({ width: 3, color: BUTTON_EDGE });
  }
}

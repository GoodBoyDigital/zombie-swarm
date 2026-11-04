import { Application, Container, Text } from "pixi.js";
import { Audio, type MusicName } from "./audio/Audio";
import { ARENA } from "./config/arena";
import { WEAPONS } from "./config/weapons";
import { Input } from "./core/Input";
import { Horde } from "./entities/Horde";
import { Player } from "./entities/Player";
import { Weapon } from "./combat/Weapon";
import { Camera } from "./fx/Camera";
import { Effects } from "./fx/Effects";
import type { GameTextures } from "./fx/textures";
import { Arena } from "./world/Arena";
import { FloorCanvas } from "./world/FloorCanvas";

const MAX_DT = 1 / 30;
/** Number keys 1..n pick a music theme; 0 stops it. */
const THEME_KEYS: MusicName[] = [
  "surfRock",
  "synthwaveDread",
  "chiptuneFrenzy",
];
const GROAN_INTERVAL = 0.35;

export class Game {
  private readonly world = new Container();
  private readonly input: Input;
  private readonly camera: Camera;
  private readonly arena: Arena;
  private readonly floor: FloorCanvas;
  private readonly player: Player;
  private readonly horde: Horde;
  private readonly fx: Effects;
  private readonly weapon: Weapon;
  private readonly hud: Text;
  private hudTimer = 0;
  private readonly audio = new Audio();
  private groanTimer = 0;

  constructor(
    private readonly app: Application,
    tex: GameTextures,
  ) {
    this.input = new Input(app);
    this.camera = new Camera(app, this.world);
    this.arena = new Arena(tex);
    this.floor = new FloorCanvas(app.renderer, tex);
    this.player = new Player(tex, ARENA.width / 2, ARENA.height / 2);
    this.horde = new Horde(tex, this.arena, this.floor);
    this.fx = new Effects(tex);
    this.fx.view.isRenderGroup = true;
    this.weapon = new Weapon(
      WEAPONS.rifle,
      this.player,
      this.horde,
      this.fx,
      this.camera,
      this.audio,
    );
    void this.audio.load().then(() => {
      this.audio.loop("hordeAmbience", 0.35);
      this.audio.playMusic("synthwaveDread");
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Digit0") this.audio.stopMusic();
      const theme = THEME_KEYS[Number(e.key) - 1];
      if (theme) this.audio.playMusic(theme);
    });

    // Draw order: floor gore, walls, zombies, player, then additive effects on top.
    this.world.addChild(
      this.floor.view,
      this.arena.view,
      this.horde.corpses.view,
      this.horde.view,
      this.player.view,
      this.fx.view,
    );

    this.hud = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: 16,
        fill: 0xf0ead8,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.hud.position.set(12, 10);
    app.stage.addChild(this.world, this.hud);

    app.ticker.add((ticker) =>
      this.step(Math.min(MAX_DT, ticker.deltaMS / 1000)),
    );
  }

  private step(dt: number): void {
    this.player.update(dt, this.input, this.camera, this.arena);
    this.horde.update(dt, this.player.x, this.player.y, this.player.radius);
    this.weapon.update(dt, this.input.firing);
    this.fx.update(dt);
    this.camera.update(dt);
    this.groan(dt);
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.25;
    const theme = this.audio.currentMusic ?? "off";
    this.hud.text = `kills ${this.horde.kills}   horde ${this.horde.alive.length}   fps ${Math.round(this.app.ticker.FPS)}   music [1-3, 0 off]: ${theme}`;
  }

  /** A random nearby zombie moans every so often, louder the closer it is. */
  private groan(dt: number): void {
    this.groanTimer -= dt;
    if (this.groanTimer > 0 || this.horde.alive.length === 0) return;
    this.groanTimer = GROAN_INTERVAL;
    const z =
      this.horde.alive[Math.floor(Math.random() * this.horde.alive.length)];
    const dist = Math.hypot(z.x - this.player.x, z.y - this.player.y);
    const volume = Math.max(0, 1 - dist / 700) * 0.5;
    if (volume <= 0.02) return;
    this.audio.play(Math.random() < 0.5 ? "groan1" : "groan2", {
      volume,
      pitch: 0.8 + Math.random() * 0.4,
    });
  }
}

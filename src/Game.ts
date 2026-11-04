import { Application, Container, Text } from "pixi.js";
import { Audio, type MusicName } from "./audio/Audio";
import { ARENA } from "./config/arena";
import type { DropDef } from "./config/drops";
import { POWERUPS } from "./config/powerups";
import { WEAPON_IDS, type WeaponId } from "./config/weapons";
import { Input } from "./core/Input";
import { pick } from "./core/random";
import { profiler } from "./debug/Profiler";
import { setupTuning } from "./debug/TuningPanel";
import { Drops } from "./entities/Drops";
import { Horde } from "./entities/Horde";
import { Loot } from "./entities/Loot";
import { Powerups } from "./entities/Powerups";
import { Player } from "./entities/Player";
import { aiDebug } from "./entities/ZombieBrain";
import { Weapon } from "./combat/Weapon";
import { Camera } from "./fx/Camera";
import { Casings } from "./fx/Casings";
import { Effects } from "./fx/Effects";
import type { GameTextures } from "./fx/textures";
import { Reticle } from "./ui/Reticle";
import { Arena } from "./world/Arena";
import { FloorCanvas } from "./world/FloorCanvas";

const MAX_DT = 1 / 30;
/** F1..F3 pick a music theme; F4 stops it. */
const THEME_KEYS: Record<string, MusicName> = {
  F1: "surfRock",
  F2: "synthwaveDread",
  F3: "chiptuneFrenzy",
};
const GROAN_INTERVAL = 0.35;

/** Keys typed into the tuning panel's fields must not reach the game. */
export const isTyping = (e: KeyboardEvent): boolean =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement;

export class Game {
  private readonly world = new Container();
  private readonly input: Input;
  private readonly camera: Camera;
  private readonly arena: Arena;
  private readonly floor: FloorCanvas;
  private readonly player: Player;
  private readonly horde: Horde;
  private readonly fx: Effects;
  private readonly casings: Casings;
  private readonly loot: Loot;
  private readonly drops: Drops;
  private readonly powerups: Powerups;
  private readonly weapon: Weapon;
  private readonly hud: Text;
  private readonly reticle: Reticle;
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
    this.casings = new Casings(tex, this.floor);
    this.loot = new Loot(tex, this.fx, this.audio);
    this.powerups = new Powerups(this.audio);
    this.drops = new Drops(tex, this.arena, this.fx, this.audio, (def) =>
      this.collectDrop(def),
    );
    this.horde.onKill = (z) => {
      this.loot.burst(z.x, z.y, z.kx, z.ky, z.def.lootScale);
      this.drops.onKill(z.x, z.y);
    };
    this.weapon = new Weapon(
      this.player,
      this.horde,
      this.fx,
      this.floor,
      this.camera,
      this.audio,
      this.casings,
    );
    void this.audio.load().then(() => {
      this.audio.loop("hordeAmbience", 0.35);
      this.audio.playMusic("synthwaveDread");
    });
    window.addEventListener("keydown", (e) => this.hotkey(e));
    setupTuning();

    // Draw order: floor gore, walls, sliding bodies, player, then the living horde over him so
    // he gets swamped, with additive effects on top of everything.
    this.world.addChild(
      this.floor.view,
      this.arena.view,
      this.horde.corpses.view,
      this.loot.view,
      this.drops.view,
      this.player.view,
      this.horde.view,
      this.casings.view,
      this.fx.view,
      this.horde.debugView,
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
    this.reticle = new Reticle(this.input);
    app.stage.addChild(this.world, this.hud, this.reticle.view);

    app.ticker.add((ticker) =>
      this.step(Math.min(MAX_DT, ticker.deltaMS / 1000)),
    );
  }

  /** Pickups call this; number keys use it for testing. */
  equip(id: WeaponId): void {
    this.weapon.equip(id);
  }

  private collectDrop(def: DropDef): void {
    if (def.kind === "weapon") this.equip(def.weapon);
    else this.powerups.apply(def.powerup);
  }

  private hotkey(e: KeyboardEvent): void {
    if (isTyping(e)) return;
    if (e.code === "KeyR") this.weapon.reload();
    if (e.code === "KeyV") aiDebug.enabled = !aiDebug.enabled;
    if (e.code === "F4") this.audio.stopMusic();
    const theme = THEME_KEYS[e.code];
    if (theme) this.audio.playMusic(theme);
    // Digit1..Digit7 swap weapons in config order.
    const weapon = WEAPON_IDS[Number(e.key) - 1];
    if (weapon && /^Digit\d$/.test(e.code)) this.equip(weapon);
    if (e.code.startsWith("F") && e.code.length <= 3) e.preventDefault();
  }

  private step(dt: number): void {
    profiler.beginFrame();
    this.powerups.update(dt);
    this.player.speedScale = this.powerups.scale("moveSpeed");
    this.player.magnetRadiusScale = this.powerups.scale("magnetRadius");
    this.player.magnetPullScale = this.powerups.scale("magnetPull");
    this.weapon.fireIntervalScale = this.powerups.scale("fireInterval");
    this.weapon.spreadScale = this.powerups.scale("spread");
    this.weapon.damageScale = this.powerups.scale("damage");
    this.player.update(dt, this.input, this.camera, this.arena);
    profiler.lap("player");
    this.horde.update(dt, this.player.x, this.player.y, this.player.radius);
    profiler.lap("horde");
    this.weapon.update(dt, this.input.firing);
    profiler.lap("weapon");
    this.loot.update(dt, this.player);
    profiler.lap("loot");
    this.drops.update(dt, this.player);
    this.fx.update(dt);
    profiler.lap("fx");
    this.casings.update(dt);
    profiler.lap("casings");
    this.camera.update(dt);
    this.reticle.update(dt, this.weapon);
    this.groan(dt);
    profiler.lap("misc");
    profiler.endFrame();
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.25;
    const theme = this.audio.currentMusic ?? "off";
    const w = this.weapon;
    const active = this.powerups.active
      .map(
        (p) => `   ${POWERUPS[p.id].name.toUpperCase()} ${p.left.toFixed(1)}s`,
      )
      .join("");
    const ai = aiDebug.enabled
      ? `   wander ${this.horde.wandering} / chase ${this.horde.alive.length - this.horde.wandering}\n${profiler.report()}`
      : "";
    const step = `   step ${(profiler.smoothed.step ?? 0).toFixed(1)} ms`;
    const ammo = w.reloading
      ? `RELOADING ${Math.ceil(w.reloadLeft * 10) / 10}s`
      : `${w.rounds}/${w.def.magazine}`;
    this.hud.text =
      `${w.def.name.toUpperCase()} ${ammo}   [1-7 weapon, R reload]\n` +
      `coins ${this.loot.counters.coins}   gems ${this.loot.counters.gems}   on floor ${this.loot.count}${active}\n` +
      `kills ${this.horde.kills}   horde ${this.horde.alive.length}   fps ${Math.round(this.app.ticker.FPS)}${step}   music [F1-F3, F4 off]: ${theme}${ai}`;
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
    this.audio.play(pick(z.def.groans), {
      volume,
      pitch: (0.8 + Math.random() * 0.4) * z.def.voicePitch,
    });
  }
}

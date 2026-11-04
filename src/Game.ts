import { Application, Container, Text } from "pixi.js";
import type { Audio, MusicName } from "./audio/Audio";
import { ARENA } from "./config/arena";
import type { DropDef } from "./config/drops";
import { PLAYER } from "./config/player";
import { WEAPON_IDS, type WeaponId } from "./config/weapons";
import { Input } from "./core/Input";
import { pick, rand } from "./core/random";
import { Drops } from "./entities/Drops";
import { Horde } from "./entities/Horde";
import { Loot } from "./entities/Loot";
import { Player } from "./entities/Player";
import { aiDebug } from "./entities/ZombieBrain";
import { Weapon } from "./combat/Weapon";
import { Camera } from "./fx/Camera";
import { Casings } from "./fx/Casings";
import { Effects } from "./fx/Effects";
import type { GameTextures } from "./fx/textures";
import { GameOver } from "./ui/GameOver";
import { HealthBar } from "./ui/HealthBar";
import { Reticle } from "./ui/Reticle";
import { Vignette } from "./ui/Vignette";
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
/** Camera trauma per hit taken. */
const HURT_TRAUMA = 0.45;
/** Music level while the end card is up. */
const DEATH_MUSIC_DUCK = 0.25;
const HUD_TOP = 10;
const HUD_LEFT = 12;
const HEALTH_BAR_HEIGHT = 16;

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
  private readonly weapon: Weapon;
  private readonly hud: Text;
  private readonly healthBar = new HealthBar();
  private readonly vignette: Vignette;
  private readonly gameOver: GameOver;
  private readonly reticle: Reticle;
  private hudTimer = 0;
  private groanTimer = 0;
  /** Seconds survived; stops at death. */
  private elapsed = 0;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(
    private readonly app: Application,
    private readonly tex: GameTextures,
    private readonly audio: Audio,
    private readonly onRestart: () => void,
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
    this.audio.duckMusic(1);
    this.onKeyDown = (e) => this.hotkey(e);
    window.addEventListener("keydown", this.onKeyDown);

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
    this.hud.position.set(HUD_LEFT, HUD_TOP + HEALTH_BAR_HEIGHT + 6);
    this.healthBar.view.position.set(HUD_LEFT, HUD_TOP);
    this.vignette = new Vignette(app);
    this.gameOver = new GameOver(app, onRestart);
    this.reticle = new Reticle(tex, this.input);
    app.stage.addChild(
      this.world,
      this.vignette.view,
      this.healthBar.view,
      this.hud,
      this.gameOver.view,
      this.reticle.view,
    );

    this.tick = (ticker) => this.step(Math.min(MAX_DT, ticker.deltaMS / 1000));
    app.ticker.add(this.tick);
  }

  /** Tear everything down so a new Game can be built on the same app. */
  destroy(): void {
    this.app.ticker.remove(this.tick);
    window.removeEventListener("keydown", this.onKeyDown);
    this.input.destroy();
    this.floor.destroy();
    for (const child of [
      this.world,
      this.vignette.view,
      this.healthBar.view,
      this.hud,
      this.gameOver.view,
      this.reticle.view,
    ])
      child.destroy({ children: true });
  }

  /** Pickups call this; number keys use it for testing. */
  equip(id: WeaponId): void {
    this.weapon.equip(id);
  }

  private collectDrop(def: DropDef): void {
    if (def.kind === "weapon") this.equip(def.weapon);
    if (def.kind === "health") this.player.heal(def.heal);
    // Power-ups: timed modifiers over the player and weapon defs, not built yet.
  }

  private hotkey(e: KeyboardEvent): void {
    if (isTyping(e)) return;
    if (e.code === "KeyR") {
      if (this.player.alive) this.weapon.reload();
      else this.onRestart();
    }
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
    const p = this.player;
    if (p.alive) {
      this.elapsed += dt;
      p.update(dt, this.input, this.camera, this.arena);
    }
    this.horde.update(dt, p.x, p.y, p.radius);
    if (p.alive) {
      this.weapon.update(dt, this.input.firing);
      this.loot.update(dt, p);
      this.drops.update(dt, p);
      this.takeContactDamage();
    }
    this.fx.update(dt);
    this.casings.update(dt);
    this.camera.update(dt);
    this.vignette.update(dt, p.health / PLAYER.maxHealth);
    this.healthBar.update(p.health, PLAYER.maxHealth);
    this.reticle.update(dt, this.weapon);
    this.groan(dt);
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.25;
    const theme = this.audio.currentMusic ?? "off";
    const w = this.weapon;
    const ai = aiDebug.enabled
      ? `   wander ${this.horde.wandering} / chase ${this.horde.alive.length - this.horde.wandering}`
      : "";
    const ammo = w.reloading
      ? `RELOADING ${Math.ceil(w.reloadLeft * 10) / 10}s`
      : `${w.rounds}/${w.def.magazine}`;
    this.hud.text =
      `${w.def.name.toUpperCase()} ${ammo}   [1-7 weapon, R reload]\n` +
      `coins ${this.loot.counters.coins}   gems ${this.loot.counters.gems}   on floor ${this.loot.count}\n` +
      `kills ${this.horde.kills}   horde ${this.horde.alive.length}${ai}   fps ${Math.round(this.app.ticker.FPS)}   music [F1-F3, F4 off]: ${theme}`;
  }

  /** Zombies in contact bite as one lump per immunity window, so the feedback reads as discrete hits. */
  private takeContactDamage(): void {
    const p = this.player;
    const scale = this.horde.contact(p.x, p.y, p.radius, PLAYER.contactMargin);
    if (scale <= 0) return;
    const bite = scale * PLAYER.contactDamage * PLAYER.invulnSeconds;
    if (!p.hurt(bite)) return;
    this.audio.play("playerHurt", { pitch: rand(0.9, 1.1), volume: 0.9 });
    this.camera.addTrauma(HURT_TRAUMA);
    this.vignette.hit();
    if (!p.alive) this.die();
  }

  /** The player goes down: body on the floor, the horde loses interest, music ducks, end card up. */
  private die(): void {
    const p = this.player;
    this.floor.stampTexture(this.tex.playerCorpse, p.x, p.y, {
      rotation: p.aim + rand(-0.4, 0.4),
    });
    p.view.visible = false;
    this.horde.calm();
    this.audio.duckMusic(DEATH_MUSIC_DUCK);
    this.gameOver.show({
      seconds: this.elapsed,
      kills: this.horde.kills,
      coins: this.loot.counters.coins,
    });
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

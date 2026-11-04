import { Application, Container, Text, UPDATE_PRIORITY } from "pixi.js";
import type { Audio, MusicName } from "./audio/Audio";
import { ARENA } from "./config/arena";
import { PLAYER } from "./config/player";
import { POWERUP_DEFS, type PowerupDef } from "./config/powerups";
import { WEAPON_IDS, type WeaponId } from "./config/weapons";
import { Input } from "./core/Input";
import { pick, rand } from "./core/random";
import { profiler } from "./debug/Profiler";
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
import { PowerupPills } from "./ui/PowerupPills";
import { Reticle } from "./ui/Reticle";
import { Vignette } from "./ui/Vignette";
import { UI_FONT } from "./ui/font";
import { PowerupContext } from "./powerups/PowerupContext";
import { Powerups } from "./powerups/Powerups";
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
const HEALTH_BAR_WIDTH = 200;
/** Gap between the health bar and the first power-up pill's icon disc. */
const PILLS_GAP = 32;
/** Where the P key drops a test orb, ahead of the player along his aim. */
const TEST_DROP_DISTANCE = 90;

/** Keys typed into the tuning panel's fields must not reach the game. */
export const isTyping = (e: KeyboardEvent): boolean =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement;

export class Game {
  private readonly world = new Container();
  /** Power-up visuals: world-space over the horde, and screen-space under the HUD. */
  private readonly powerupWorld = new Container({ label: "powerupWorld" });
  private readonly powerupScreen = new Container({ label: "powerupScreen" });
  /** Next power-up the P key drops, cycling through the table. */
  private testDrop = 0;
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
  private readonly healthBar = new HealthBar();
  private readonly pills: PowerupPills;
  private readonly vignette: Vignette;
  private readonly gameOver: GameOver;
  private readonly reticle: Reticle;
  private hudTimer = 0;
  private groanTimer = 0;
  /** Seconds survived; stops at death. */
  private elapsed = 0;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private readonly endRender = (): void => profiler.endRender();
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
    this.camera.snapTo(this.player.x, this.player.y);
    this.horde = new Horde(tex, this.arena, this.floor);
    this.fx = new Effects(tex);
    this.fx.view.isRenderGroup = true;
    this.casings = new Casings(tex, this.floor);
    this.loot = new Loot(tex, this.fx, this.audio);
    this.drops = new Drops(tex, this.arena, this.fx, (def) =>
      this.powerups.apply(def),
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
    this.powerups = new Powerups(
      new PowerupContext(
        this.horde,
        this.fx,
        this.floor,
        this.camera,
        this.audio,
        this.player,
        this.weapon,
        this.powerupWorld,
        this.powerupScreen,
        app.screen,
      ),
    );
    this.audio.duckMusic(1);
    this.onKeyDown = (e) => this.hotkey(e);
    window.addEventListener("keydown", this.onKeyDown);

    // Draw order: floor gore, walls, sliding bodies, player, then the living horde over him so
    // he gets swamped, then casings and effects. Power-up orbs sit over all of it so they are never
    // lost in the crowd, and power-up visuals (bubbles, domes, planes) over the orbs.
    this.world.addChild(
      this.floor.view,
      this.arena.view,
      this.horde.corpses.view,
      this.loot.view,
      this.player.view,
      this.horde.view,
      this.casings.view,
      this.fx.view,
      this.horde.debugView,
      this.drops.view,
      this.powerupWorld,
    );

    this.hud = new Text({
      text: "",
      style: {
        ...UI_FONT,
        fontSize: 17,
        lineHeight: 24,
        fill: 0xfff6e0,
        stroke: { color: 0x151a15, width: 5, join: "round" },
        dropShadow: {
          color: 0x151a15,
          alpha: 0.6,
          angle: Math.PI / 2,
          distance: 2,
          blur: 0,
        },
      },
    });
    this.hud.position.set(HUD_LEFT, HUD_TOP + HEALTH_BAR_HEIGHT + 6);
    this.healthBar.view.position.set(HUD_LEFT, HUD_TOP);
    this.pills = new PowerupPills(tex);
    this.pills.view.position.set(
      HUD_LEFT + HEALTH_BAR_WIDTH + PILLS_GAP,
      HUD_TOP + HEALTH_BAR_HEIGHT / 2 + 1,
    );
    this.vignette = new Vignette(app);
    this.gameOver = new GameOver(app, onRestart);
    this.reticle = new Reticle(this.input);
    app.stage.addChild(
      this.world,
      this.vignette.view,
      this.powerupScreen,
      this.healthBar.view,
      this.pills.view,
      this.hud,
      this.gameOver.view,
      this.reticle.view,
    );

    this.tick = (ticker) => this.step(Math.min(MAX_DT, ticker.deltaMS / 1000));
    app.ticker.add(this.tick);
    // Pixi renders in its own LOW-priority listener; one below it sees the render's CPU cost.
    app.ticker.add(this.endRender, undefined, UPDATE_PRIORITY.LOW - 1);
  }

  /** Tear everything down so a new Game can be built on the same app. */
  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.app.ticker.remove(this.endRender);
    window.removeEventListener("keydown", this.onKeyDown);
    this.input.destroy();
    this.floor.destroy();
    for (const child of [
      this.world,
      this.vignette.view,
      this.powerupScreen,
      this.healthBar.view,
      this.pills.view,
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

  private hotkey(e: KeyboardEvent): void {
    if (isTyping(e)) return;
    if (e.code === "KeyR") {
      if (this.player.alive) this.weapon.reload();
      else this.onRestart();
    }
    if (e.code === "KeyV") aiDebug.enabled = !aiDebug.enabled;
    if (e.code === "KeyP")
      this.dropTestOrb(POWERUP_DEFS[this.testDrop++ % POWERUP_DEFS.length]);
    if (e.code === "F4") this.audio.stopMusic();
    const theme = THEME_KEYS[e.code];
    if (theme) this.audio.playMusic(theme);
    // Digit1..Digit7 swap weapons in config order.
    const weapon = WEAPON_IDS[Number(e.key) - 1];
    if (weapon && /^Digit\d$/.test(e.code)) this.equip(weapon);
    if (e.code.startsWith("F") && e.code.length <= 3) e.preventDefault();
  }

  /** An orb just ahead of the player, so every power-up can be tried on demand. */
  private dropTestOrb(def: PowerupDef): void {
    const p = this.player;
    this.drops.drop(
      def,
      p.x + Math.cos(p.aim) * TEST_DROP_DISTANCE,
      p.y + Math.sin(p.aim) * TEST_DROP_DISTANCE,
    );
  }

  private step(dt: number): void {
    profiler.beginFrame();
    if (this.player.alive) this.powerups.update(dt);
    const mods = this.powerups.ctx.modifiers;
    this.player.speedScale = mods.moveSpeed;
    this.player.magnetRadiusScale = mods.magnetRadius;
    this.player.magnetPullScale = mods.magnetPull;
    this.weapon.fireIntervalScale = mods.fireInterval;
    this.weapon.spreadScale = mods.spread;
    this.weapon.damageScale = mods.damage;
    const p = this.player;
    if (p.alive) {
      this.elapsed += dt;
      p.update(dt, this.input, this.camera, this.arena);
    }
    profiler.lap("player");
    this.horde.update(dt, p.x, p.y, p.radius);
    profiler.lap("horde");
    if (p.alive) {
      this.weapon.update(dt, this.input.firing);
      profiler.lap("weapon");
      this.loot.update(dt, p);
      profiler.lap("loot");
      this.drops.update(dt, p);
      this.takeContactDamage();
    }
    this.fx.update(dt);
    profiler.lap("fx");
    this.casings.update(dt);
    profiler.lap("casings");
    this.camera.update(dt, this.player.x, this.player.y);
    this.vignette.update(dt, p.health / PLAYER.maxHealth);
    this.healthBar.update(p.health, PLAYER.maxHealth);
    this.pills.update(this.powerups.active);
    this.reticle.update(dt, this.weapon);
    this.groan(dt);
    profiler.lap("misc");
    profiler.endFrame();
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.25;
    const theme = this.audio.currentMusic ?? "off";
    const w = this.weapon;
    const ai = aiDebug.enabled
      ? `   wander ${this.horde.wandering} / chase ${this.horde.alive.length - this.horde.wandering}\n${profiler.report()}`
      : "";
    const step = `   step ${(profiler.smoothed.step ?? 0).toFixed(1)} ms   render ${(profiler.smoothed.render ?? 0).toFixed(1)} ms`;
    const ammo = w.reloading
      ? `RELOADING ${Math.ceil(w.reloadLeft * 10) / 10}s`
      : `${w.rounds}/${w.def.magazine}`;
    this.hud.text =
      `${w.def.name.toUpperCase()} ${ammo}   [1-7 weapon, R reload]\n` +
      `coins ${this.loot.counters.coins}   gems ${this.loot.counters.gems}   on floor ${this.loot.count}\n` +
      `hp ${Math.ceil(this.player.health)}/${PLAYER.maxHealth}   kills ${this.horde.kills}   horde ${this.horde.alive.length}   fps ${Math.round(this.app.ticker.FPS)}${step}   music [F1-F3, F4 off]: ${theme}${ai}`;
  }

  /** Zombies in contact bite as one lump per immunity window, so the feedback reads as discrete hits. */
  private takeContactDamage(): void {
    const p = this.player;
    const scale = this.horde.contact(p.x, p.y, p.radius, PLAYER.contactMargin);
    if (scale <= 0) return;
    // Crowds hurt more than their headcount: one walker is a nuisance, eight are a death sentence.
    const bite =
      PLAYER.contactDamage *
      Math.pow(scale, PLAYER.crowdPower) *
      PLAYER.invulnSeconds;
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

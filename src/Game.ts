import { Application, Container, Text, UPDATE_PRIORITY } from "pixi.js";
import type { Audio, MusicName } from "./audio/Audio";
import { ARENA } from "./config/arena";
import { CONTROLS } from "./config/controls";
import { GRADES } from "./config/grade";
import { PLAYER } from "./config/player";
import { POWERUP_DEFS, type PowerupDef } from "./config/powerups";
import { LEVELS } from "./config/run";
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
import { ColorGrade } from "./fx/ColorGrade";
import { Effects } from "./fx/Effects";
import { ColorMask } from "./fx/ColorMask";
import type { GameTextures } from "./fx/textures";
import { recordRun } from "./meta/save";
import { Run } from "./run/Run";
import { HealthBar } from "./ui/HealthBar";
import { PowerupPills } from "./ui/PowerupPills";
import { Results } from "./ui/Results";
import { Reticle } from "./ui/Reticle";
import { RunHud } from "./ui/RunHud";
import { SAFE_AREA } from "./ui/safeArea";
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
/** Dev-only X key: jump the countdown to this many seconds left; press again to skip to the chopper's descent. */
const SKIP_TO_SECONDS = 10;
/** Weapon swap keys, in config order. */
const WEAPON_KEYS = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
  "Minus",
];

/** Keys typed into the tuning panel's fields must not reach the game. */
export const isTyping = (e: KeyboardEvent): boolean =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement;

export class Game {
  private readonly world = new Container();
  /** One colour-grade pass over the world, under the HUD. */
  private readonly grade: ColorGrade;
  private readonly colorMask: ColorMask;
  /** Power-up visuals: world-space over the horde, and screen-space under the HUD. */
  private readonly powerupWorld = new Container({ label: "powerupWorld" });
  private readonly powerupGround = new Container({ label: "powerupGround" });
  private readonly powerupSky = new Container({ label: "powerupSky" });
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
  private readonly results: Results;
  private readonly reticle: Reticle;
  private readonly run: Run;
  private readonly runHud: RunHud;
  private hudTimer = 0;
  private groanTimer = 0;
  private readonly tick: (ticker: { deltaMS: number }) => void;
  private readonly endRender = (): void => profiler.endRender();
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(
    private readonly app: Application,
    private readonly tex: GameTextures,
    private readonly audio: Audio,
    level: number,
    /** Builds a fresh Game on the given LEVELS index. */
    private readonly onRestart: (level: number) => void,
  ) {
    this.input = new Input(app);
    this.grade = new ColorGrade(app.screen);
    this.grade.view.addChild(this.world);
    this.colorMask = new ColorMask(app.renderer, app.screen);
    this.camera = new Camera(app, this.world);
    this.arena = new Arena(tex);
    this.floor = new FloorCanvas(app.renderer, tex, LEVELS[level].floor);
    this.player = new Player(tex, ARENA.width / 2, ARENA.height / 2);
    this.camera.snapTo(this.player.x, this.player.y);
    this.fx = new Effects(tex);
    this.horde = new Horde(
      tex,
      this.arena,
      this.floor,
      LEVELS[level],
      this.fx,
      audio,
    );
    this.fx.view.isRenderGroup = true;
    this.casings = new Casings(tex, this.floor);
    this.loot = new Loot(tex, this.fx, this.audio);
    this.drops = new Drops(
      tex,
      this.arena,
      this.fx,
      (def, x, y) => this.powerups.apply(def, x, y),
      () => this.weapon.id,
    );
    this.horde.onKill = (z) => {
      this.loot.burst(z.x, z.y, z.kx, z.ky, z.def.lootScale);
      this.drops.onKill(z.x, z.y, this.horde.volley);
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
        this.casings,
        this.player,
        this.weapon,
        this.powerupWorld,
        this.powerupSky,
        this.powerupGround,
        this.powerupScreen,
        app.screen,
        this.grade,
      ),
    );
    const chopperWorld = {
      horde: this.horde,
      fx: this.fx,
      camera: this.camera,
      audio,
    };
    this.run = new Run(level, tex, chopperWorld, {
      ground: this.powerupGround,
      world: this.powerupWorld,
      sky: this.powerupSky,
    });
    this.run.onBoard = () => this.board();
    this.run.onExtracted = () => this.finish(true);
    this.audio.duckMusic(1);
    this.onKeyDown = (e) => this.hotkey(e);
    window.addEventListener("keydown", this.onKeyDown);

    // Draw order: floor gore, walls, sliding bodies, player, then the living horde over him so
    // he gets swamped, ice over the frozen ones, then casings and effects. Flying limbs go over
    // the effects so a head stays readable through its own blood spray. Power-up orbs sit over all of it so they are never
    // lost in the crowd, and power-up visuals (bubbles, domes) over the orbs. Explosions go over
    // everything on the ground, and only planes and falling bombs fly over the explosions.
    this.world.addChild(
      this.floor.view,
      this.arena.view,
      this.floor.wallView,
      this.horde.corpses.view,
      this.loot.view,
      this.powerupGround,
      this.player.view,
      this.horde.view,
      this.horde.ice.view,
      this.casings.view,
      this.fx.view,
      this.horde.limbs.view,
      this.horde.debugView,
      this.drops.view,
      this.powerupWorld,
      this.fx.blastView,
      this.powerupSky,
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
    this.pills = new PowerupPills(tex);
    this.layoutHud();
    app.renderer.on("resize", this.layoutHud);
    this.vignette = new Vignette(app);
    this.results = new Results(
      app,
      () => onRestart(level),
      () => onRestart(level + 1),
    );
    this.runHud = new RunHud(app);
    this.reticle = new Reticle(this.input);
    app.stage.addChild(
      this.grade.view,
      this.vignette.view,
      this.powerupScreen,
      this.healthBar.view,
      this.pills.view,
      this.hud,
      this.runHud.view,
      this.input.sticks.view,
      this.results.view,
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
    this.app.renderer.off("resize", this.layoutHud);
    window.removeEventListener("keydown", this.onKeyDown);
    this.powerups.endAll();
    this.weapon.silence();
    this.run.destroy();
    this.input.destroy();
    this.floor.destroy();
    this.grade.destroy();
    this.colorMask.destroy();
    for (const child of [
      this.vignette.view,
      this.powerupScreen,
      this.healthBar.view,
      this.pills.view,
      this.hud,
      this.runHud.view,
      this.input.sticks.view,
      this.results.view,
      this.reticle.view,
    ])
      child.destroy({ children: true });
  }

  /** Top-left HUD, clear of a phone's notch and rounded corners. Rerun when the screen turns. */
  private readonly layoutHud = (): void => {
    const left = HUD_LEFT + SAFE_AREA.left;
    const top = HUD_TOP + SAFE_AREA.top;
    this.healthBar.view.position.set(left, top);
    this.hud.position.set(left, top + HEALTH_BAR_HEIGHT + 6);
    this.pills.view.position.set(
      left + HEALTH_BAR_WIDTH + PILLS_GAP,
      top + HEALTH_BAR_HEIGHT / 2 + 1,
    );
  };

  /** Pickups call this; number keys use it for testing. */
  equip(id: WeaponId): void {
    this.weapon.equip(id);
  }

  private hotkey(e: KeyboardEvent): void {
    if (isTyping(e)) return;
    const level = this.run.levelIndex;
    if (e.code === "KeyR") this.retryOrReload();
    if (e.code === "KeyN" && this.results.offersNext) this.onRestart(level + 1);
    if (e.code === "KeyX" && import.meta.env.DEV)
      this.run.devSkip(SKIP_TO_SECONDS);
    if (e.code === "KeyV") aiDebug.enabled = !aiDebug.enabled;
    if (e.code === "KeyP")
      this.dropOrb(POWERUP_DEFS[this.testDrop++ % POWERUP_DEFS.length]);
    if (e.code === "F4") this.audio.stopMusic();
    const theme = THEME_KEYS[e.code];
    if (theme) this.audio.playMusic(theme);
    const weapon = WEAPON_IDS[WEAPON_KEYS.indexOf(e.code)];
    if (weapon) this.equip(weapon);
    if (e.code.startsWith("F") && e.code.length <= 3) e.preventDefault();
  }

  /** R, or X on a gamepad: retry from the end card, otherwise reload. True if it restarted the game. */
  private retryOrReload(): boolean {
    if (this.results.visible) {
      this.onRestart(this.run.levelIndex);
      return true;
    }
    if (this.player.alive && !this.run.aboard) this.weapon.reload();
    return false;
  }

  /**
   * Gamepad buttons doing a key's job: A or Start presses the end card's main button, X is R.
   * True if one restarted the game, which tears this one down mid-frame.
   */
  private padButtons(): boolean {
    if (this.input.confirmPressed && this.results.visible) {
      const next = this.results.offersNext ? 1 : 0;
      this.onRestart(this.run.levelIndex + next);
      return true;
    }
    return this.input.reloadPressed && this.retryOrReload();
  }

  /** An orb just ahead of the player, so every power-up can be tried on demand (P key, tuning panel). */
  dropOrb(def: PowerupDef): void {
    const p = this.player;
    this.drops.drop(
      def,
      p.x + Math.cos(p.aim) * TEST_DROP_DISTANCE,
      p.y + Math.sin(p.aim) * TEST_DROP_DISTANCE,
    );
  }

  /**
   * `dt` is real time: the camera, the HUD and power-up timers run on it. Slow-mo scales two clocks
   * off it: the world (horde, gore, loot, projectiles) and, by less, the player and his gun.
   */
  private step(dt: number): void {
    this.input.update();
    if (this.padButtons()) return;
    profiler.beginFrame();
    this.grade.begin();
    if (this.player.alive) this.powerups.update(dt);
    const mods = this.powerups.ctx.modifiers;
    const worldDt = dt * mods.timeScale;
    const playerDt = dt * mods.playerTimeScale;
    this.powerups.ctx.timeScale = mods.timeScale;
    this.player.speedScale = mods.moveSpeed * this.weapon.moveScale;
    this.player.magnetRadiusScale = mods.magnetRadius;
    this.player.magnetPullScale = mods.magnetPull;
    this.weapon.fireIntervalScale = mods.fireInterval;
    this.weapon.spreadScale = mods.spread;
    this.weapon.damageScale = mods.damage;
    this.weapon.reloadScale = mods.reload;
    this.weapon.shotPower = mods.shotPower;
    const p = this.player;
    // Aboard the chopper the player is out of the fight: no moving, shooting, pickups or bites.
    const playing = p.alive && !this.run.aboard;
    this.input.sticks.enabled = playing;
    if (playing)
      p.update(playerDt, this.input, this.camera, this.arena, this.horde);
    this.run.update(dt, worldDt, p);
    this.horde.progress = this.run.progress;
    this.horde.phase = this.run.phase;
    profiler.lap("player");
    this.horde.update(worldDt, p.x, p.y, p.radius);
    profiler.lap("horde");
    if (playing) {
      this.weapon.update(playerDt, this.input.consumeFire());
      this.weapon.updateShots(worldDt);
      profiler.lap("weapon");
      this.loot.update(worldDt, p);
      profiler.lap("loot");
      this.drops.update(worldDt, p);
      this.takeContactDamage(mods.timeScale / mods.playerTimeScale);
    } else this.weapon.silence();
    this.fx.update(worldDt);
    profiler.lap("fx");
    this.casings.update(worldDt);
    profiler.lap("casings");
    // Thumbs cover the screen's lower corners, so on touch the camera keeps him near the middle.
    this.camera.revealShare =
      this.input.device === "touch" ? CONTROLS.touchEdgeReveal : 0;
    this.camera.update(dt, this.player.x, this.player.y);
    this.vignette.update(dt, p.health / PLAYER.maxHealth);
    this.grade.add(GRADES.lowHealth, this.vignette.lowHealth);
    if (this.grade.sparing)
      this.colorMask.render(
        this.world,
        p,
        this.powerupGround,
        this.horde,
        this.drops.view,
        this.fx,
      );
    this.grade.apply(this.colorMask);
    this.healthBar.update(p.health, PLAYER.maxHealth);
    this.pills.update(this.powerups.active);
    this.reticle.update(dt, this.weapon, p);
    this.runHud.update(dt, this.run, this.camera);
    this.groan(worldDt);
    profiler.lap("misc");
    profiler.endFrame();
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.25;
    const theme = this.audio.currentMusic ?? "off";
    const w = this.weapon;
    const ai = aiDebug.enabled
      ? `   wander ${this.horde.wandering} / chase ${this.horde.alive.length - this.horde.wandering}${this.horde.lured ? ` (decoy ${this.horde.lured})` : ""}\n${profiler.report()}`
      : "";
    const step = `   step ${(profiler.smoothed.step ?? 0).toFixed(1)} ms   render ${(profiler.smoothed.render ?? 0).toFixed(1)} ms`;
    const spare =
      w.spareMagazines === Infinity ? "" : `  +${w.spareMagazines} mags`;
    const ammo =
      (w.reloading
        ? `${w.def.fuel ? "REFUELLING" : "RELOADING"} ${Math.ceil(w.reloadLeft * 10) / 10}s`
        : w.def.fuel
          ? `fuel ${w.rounds.toFixed(1)}/${w.def.magazine}s`
          : `${w.rounds}/${w.def.magazine}`) + spare;
    // Key hints and the profiler numbers are no use on a phone, where the readout has to stay short.
    const touch = this.input.device === "touch";
    const keys = touch ? "" : "   [1-9, 0, - weapon, R reload]";
    const debug = touch ? "" : `${step}   music [F1-F3, F4 off]: ${theme}${ai}`;
    this.hud.text =
      `${w.def.name.toUpperCase()} ${ammo}${keys}\n` +
      `coins ${this.loot.counters.coins}   gems ${this.loot.counters.gems}   on floor ${this.loot.count}\n` +
      `hp ${Math.ceil(this.player.health)}/${PLAYER.maxHealth}   kills ${this.horde.kills}   horde ${this.horde.alive.length}   fps ${Math.round(this.app.ticker.FPS)}${debug}`;
  }

  /**
   * Zombies in contact bite as one lump per immunity window, so the feedback reads as discrete hits.
   * The window runs on the player's clock, so `zombieRate` (world clock over player clock) shrinks
   * each bite to keep damage per second in step with the slowed zombies.
   */
  private takeContactDamage(zombieRate: number): void {
    const p = this.player;
    const scale = this.horde.contact(p.x, p.y, p.radius, PLAYER.contactMargin);
    if (scale <= 0) return;
    // Crowds hurt more than their headcount: one walker is a nuisance, eight are a death sentence.
    const bite =
      PLAYER.contactDamage *
      Math.pow(scale, PLAYER.crowdPower) *
      PLAYER.invulnSeconds *
      zombieRate;
    if (!p.hurt(bite)) return;
    this.audio.play("playerHurt", { pitch: rand(0.9, 1.1), volume: 0.9 });
    this.camera.addTrauma(HURT_TRAUMA);
    this.vignette.hit();
    if (!p.alive) this.die();
  }

  /** The player goes down: body on the floor, the horde loses interest, end card up. */
  private die(): void {
    const p = this.player;
    this.floor.stampTexture(this.tex.playerCorpse, p.x, p.y, {
      rotation: p.aim + rand(-0.4, 0.4),
    });
    p.view.visible = false;
    this.powerups.endAll();
    this.horde.calm();
    this.finish(false);
  }

  /** The player made it onto the pad: he's aboard, the horde forgets him while the chopper lifts off. */
  private board(): void {
    this.player.view.visible = false;
    this.powerups.endAll();
    this.horde.calm();
  }

  /** The run is over either way: bank the coins, record progress, show the card. */
  private finish(extracted: boolean): void {
    const run = this.run;
    const coins = this.loot.counters.coins;
    const save = recordRun(
      { level: run.levelIndex, extracted, seconds: run.elapsed, coins },
      LEVELS.length,
    );
    this.audio.duckMusic(DEATH_MUSIC_DUCK);
    this.results.show(
      {
        extracted,
        level: run.level.name,
        seconds: run.elapsed,
        kills: this.horde.kills,
        coins,
        bankTotal: save.coins,
        bestSeconds: save.bestSeconds[run.levelIndex],
        hasNext: run.levelIndex + 1 < LEVELS.length,
      },
      this.input.device,
    );
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

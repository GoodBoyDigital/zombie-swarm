import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { ARENA } from "../config/arena";
import type { Audio } from "../audio/Audio";
import { BLOOD_SPRAY } from "../combat/CombatContext";
import { RUN } from "../config/run";
import { KNOCKBACK_DRAG, MAX_ZOMBIE_RADIUS, PART_IDS } from "../config/zombies";
import { rand } from "../core/random";
import type { ExclusionZone, Horde } from "../entities/Horde";
import type { Zombie } from "../entities/Zombie";
import { aiDebug } from "../entities/ZombieBrain";
import type { Camera } from "../fx/Camera";
import type { Effects } from "../fx/Effects";
import { BLAST_TEXTURE_RADIUS, type GameTextures } from "../fx/textures";

const INK = 0x151a15;
const PAD = 0xf2c230;
const PAD_DARK = 0x2b2a26;
const BEACON = 0x7dff6a;
/** Where the rotor hub sits on the body art, as fractions; the body is anchored there. */
const HUB = { x: 0.632, y: 0.484 };
/** Light from the top left: the shadow falls down-right, further the higher the chopper flies. */
const SHADOW_BASE = { x: 8, y: 6 };
const SHADOW_SLOPE = { x: 0.45, y: 0.35 };
const SHADOW_ALPHA = 0.3;
/** The body rises up the screen with altitude, and grows a little toward the camera. */
const LIFT = 0.5;
const ZOOM_PER_PX = 1 / 450;
/** Rotor wash fades in below this altitude. */
const WASH_ALTITUDE = 70;
/** How far outside the arena the approach starts, and how far it climbs away on departure. */
const APPROACH_DISTANCE = 900;
const DEPART_DISTANCE = 1100;
/** The descent swings the nose round by this much, so it settles rather than drops. */
const LANDING_YAW = 0.5;
const DUST_TINT = 0xbfb29a;
const DUST_LIFE = { min: 0.5, max: 1 };
const DUST_SPEED = { min: 160, max: 300 };
/** Landing zone ring pulses out this often. */
const PULSE_SECONDS = 1.1;
/** Touchdown: blood streaks thrown out from each squished zombie, and camera shake with and without victims. */
const SQUISH_SPLATS = 5;
const SQUISH_SPRAY = 10;
const SQUISH_TRAUMA = 0.4;
const LAND_TRAUMA = 0.15;
const TWO_PI = Math.PI * 2;
/** Rotor blades; each one sweeping past is a chance to chop. */
const BLADES = 4;
/** Chopped bodies and pieces leave along the blade, with this much of the push straight out from the hub. */
const FLING_OUT = 0.5;

/** What the chopper pushes, squishes and shakes. */
export interface ChopperWorld {
  horde: Horde;
  fx: Effects;
  camera: Camera;
  audio: Audio;
}

interface Circle {
  x: number;
  y: number;
  r: number;
}

type Phase = "approach" | "descend" | "landed" | "depart";

interface Dust {
  sprite: Sprite;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

/**
 * The rescue chopper: flies in from outside the arena, descends onto the landing zone, waits with
 * its rotor turning, and climbs away once the player is aboard. Runs on the world clock, so slow-mo
 * slows it too. Its body and rotor fly in the sky layer over explosions; the shadow, landing pad
 * and dust sit lower.
 */
export class Chopper {
  phase: Phase = "approach";
  /** Ground point under the rotor hub, and height above it, world px. */
  x: number;
  y: number;
  altitude = RUN.cruiseAltitude;
  /** Shown on the landing pad while the player boards, 0 to 1. */
  boardProgress = 0;
  private t = 0;
  private heading: number;
  private readonly from: { x: number; y: number };
  private readonly pad = new Graphics({ label: "landingZone" });
  private readonly pulse = new Graphics();
  private readonly progressRing = new Graphics();
  private readonly shadow = new Container();
  private readonly body = new Container({ label: "chopper" });
  private readonly rotor: Sprite;
  private readonly rotorBlur = new Graphics();
  private readonly dustLayer = new Container({ label: "chopperDust" });
  private readonly dust: Dust[] = [];
  private readonly dustPool: Sprite[] = [];
  private dustDebt = 0;
  /** The body's footprint as horde keep-out zones, from touchdown until lift-off. */
  private readonly keepOut: ExclusionZone[] = [];
  /** Footprint outline while the AI debug overlay (V) is on. */
  private readonly debug = new Graphics();
  /** Rotor angle since the last blade pass, chops banked by the rate limit, and the chop sound's cooldown. */
  private bladeTurn = 0;
  private chops = 0;
  private chopSound = 0;
  private readonly stump = { x: 0, y: 0 };
  private readonly inReach: Zombie[] = [];

  constructor(
    private readonly tex: GameTextures,
    private readonly world: ChopperWorld,
    readonly zone: { x: number; y: number },
    layers: {
      ground: Container;
      world: Container;
      sky: Container;
    },
  ) {
    // Come in from beyond the nearest side wall, high and a little off the line, so it sweeps over the arena.
    const side = zone.x < ARENA.width / 2 ? -1 : 1;
    this.from = {
      x: zone.x + side * (ARENA.width / 2 + APPROACH_DISTANCE),
      y: zone.y - 260,
    };
    this.x = this.from.x;
    this.y = this.from.y;
    this.heading = Math.atan2(zone.y - this.from.y, zone.x - this.from.x);

    const bodyTex = Assets.get<Texture>("/sprites/chopper-body.png");
    const rotorTex = Assets.get<Texture>("/sprites/chopper-rotor.png");
    const shadowBody = new Sprite({ texture: bodyTex, tint: 0x000000 });
    shadowBody.anchor.set(HUB.x, HUB.y);
    const shadowRotor = new Graphics()
      .circle(0, 0, rotorTex.width * 0.62)
      .fill({ color: 0x000000, alpha: 0.35 });
    this.shadow.addChild(shadowRotor, shadowBody);
    this.shadow.alpha = SHADOW_ALPHA;
    this.shadow.scale.set(RUN.scale);

    const hull = new Sprite({ texture: bodyTex });
    hull.anchor.set(HUB.x, HUB.y);
    this.rotor = new Sprite({ texture: rotorTex, anchor: 0.5 });
    // A faint disc and rim read as blades turning too fast to see; the blades themselves stay visible on top.
    this.rotorBlur
      .circle(0, 0, rotorTex.width * 0.68)
      .fill({ color: 0xffffff, alpha: 0.07 })
      .stroke({ color: INK, alpha: 0.25, width: 2 });
    this.rotor.alpha = 0.8;
    this.body.addChild(hull, this.rotorBlur, this.rotor);

    this.drawPad();
    this.pad.position.set(zone.x, zone.y);
    this.pulse.position.set(zone.x, zone.y);
    this.progressRing.position.set(zone.x, zone.y);
    layers.ground.addChild(
      this.pad,
      this.pulse,
      this.progressRing,
      this.shadow,
    );
    layers.world.addChild(this.dustLayer);
    layers.sky.addChild(this.body, this.debug);
    this.sync();
  }

  get landed(): boolean {
    return this.phase === "landed";
  }

  /** Dev shortcut: skip the flight in, straight to the descent onto the pad. */
  skipApproach(): void {
    if (this.phase !== "approach") return;
    this.x = this.zone.x;
    this.y = this.zone.y;
    this.phase = "descend";
    this.t = 0;
  }

  depart(): void {
    this.releaseKeepOut();
    this.phase = "depart";
    this.t = 0;
    this.from.x = this.x;
    this.from.y = this.y;
  }

  update(dt: number): void {
    this.t += dt;
    const { approachSeconds, descendSeconds, departSeconds, cruiseAltitude } =
      RUN;
    if (this.phase === "approach") {
      // Decelerate into a hover over the pad.
      const u = Math.min(1, this.t / approachSeconds);
      const ease = 1 - (1 - u) ** 3;
      this.x = this.from.x + (this.zone.x - this.from.x) * ease;
      this.y = this.from.y + (this.zone.y - this.from.y) * ease;
      if (u >= 1) {
        this.phase = "descend";
        this.t = 0;
      }
    } else if (this.phase === "descend") {
      const u = Math.min(1, this.t / descendSeconds);
      const ease = u * u * (3 - 2 * u);
      this.altitude = cruiseAltitude * (1 - ease);
      this.heading += (LANDING_YAW * dt) / descendSeconds;
      if (u >= 1) {
        this.phase = "landed";
        this.altitude = 0;
        this.touchdown();
      }
    } else if (this.phase === "depart") {
      // Lift straight up first, then tip the nose forward and accelerate away.
      const u = this.t / departSeconds;
      this.altitude = cruiseAltitude * 1.6 * Math.min(1, u * 1.5) ** 2;
      const run = DEPART_DISTANCE * Math.max(0, u - 0.25) ** 2;
      this.x = this.from.x + Math.cos(this.heading) * run;
      this.y = this.from.y + Math.sin(this.heading) * run;
    }
    this.rotor.rotation += RUN.rotorSpin * dt;
    if (this.phase === "landed") this.slice(dt);
    const wash =
      this.phase === "descend" ? this.descentWash(dt) : this.blow(dt);
    this.kickDust(dt, wash);
    this.updateDust(dt);
    this.drawDebug();
    this.updatePad(dt);
    this.sync();
  }

  destroy(): void {
    this.releaseKeepOut();
    for (const view of [
      this.pad,
      this.pulse,
      this.progressRing,
      this.shadow,
      this.dustLayer,
      this.body,
      this.debug,
    ])
      view.destroy({ children: true });
    for (const s of this.dustPool) s.destroy();
  }

  private sync(): void {
    const a = this.altitude;
    this.body.position.set(this.x, this.y - a * LIFT);
    this.body.rotation = this.heading;
    this.body.scale.set(RUN.scale * (1 + a * ZOOM_PER_PX));
    this.shadow.position.set(
      this.x + SHADOW_BASE.x + a * SHADOW_SLOPE.x,
      this.y + SHADOW_BASE.y + a * SHADOW_SLOPE.y,
    );
    this.shadow.rotation = this.heading;
  }

  /** The body's footprint circles on the ground, in world px, for the current position and heading. */
  private footprint(): Circle[] {
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    return RUN.footprint.map((c) => ({
      x: this.x + cos * c.along * RUN.scale,
      y: this.y + sin * c.along * RUN.scale,
      r: c.radius * RUN.scale,
    }));
  }

  /**
   * Descending: shove zombies straight out from the body's tail-to-nose line, harder the lower it
   * gets, so the ground under the whole body is clear by touchdown. Returns the wash strength, 0 to 1.
   */
  private descentWash(dt: number): number {
    const strength = (1 - this.altitude / RUN.cruiseAltitude) ** 2;
    const reach = RUN.descentReach;
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    const along = RUN.footprint.map((c) => c.along * RUN.scale);
    const tail = Math.min(...along);
    const nose = Math.max(...along);
    const xs = [this.x + cos * tail, this.x + cos * nose];
    const ys = [this.y + sin * tail, this.y + sin * nose];
    this.world.horde.hash.queryBox(
      Math.min(...xs) - reach,
      Math.min(...ys) - reach,
      Math.max(...xs) + reach,
      Math.max(...ys) + reach,
      (z) => {
        if (z.dead) return;
        // Nearest point on the body's line, then straight out from it.
        const t = (z.x - this.x) * cos + (z.y - this.y) * sin;
        const at = Math.min(nose, Math.max(tail, t));
        let dx = z.x - (this.x + cos * at);
        let dy = z.y - (this.y + sin * at);
        const d = Math.hypot(dx, dy);
        if (d >= reach) return;
        if (d > 0.001) {
          dx /= d;
          dy /= d;
        } else {
          dx = -sin;
          dy = cos;
        }
        const push = RUN.descentPush * strength * (1 - d / reach);
        z.push(dx, dy, push * KNOCKBACK_DRAG * dt);
      },
    );
    return strength;
  }

  /**
   * Touchdown: anything still under the body is crushed (gore stamped into the floor, counted as a
   * kill), then the footprint becomes solid so the horde piles up around it until lift-off.
   */
  private touchdown(): void {
    const { horde, fx, camera, audio } = this.world;
    const circles = this.footprint();
    const crushed = new Set<Zombie>();
    for (const c of circles) {
      const reach = c.r + MAX_ZOMBIE_RADIUS;
      horde.hash.queryBox(
        c.x - reach,
        c.y - reach,
        c.x + reach,
        c.y + reach,
        (z) => {
          if (z.dead) return;
          const r = c.r + z.def.radius * RUN.squishOverlap;
          if ((z.x - c.x) ** 2 + (z.y - c.y) ** 2 < r * r) crushed.add(z);
        },
      );
    }
    for (const z of crushed) {
      // Flattened where it stood: a star of streaks and a spray out from under the skids.
      // A frozen one shatters instead (the horde's kill), no blood.
      z.kx = 0;
      z.ky = 0;
      z.drop();
      if (z.frozen) {
        horde.kill(z, "count");
        continue;
      }
      for (let i = 0; i < SQUISH_SPLATS; i++) {
        const a = (i / SQUISH_SPLATS) * TWO_PI + rand(-0.4, 0.4);
        horde.splat(z.x, z.y, Math.cos(a), Math.sin(a));
      }
      const a = rand(0, TWO_PI);
      fx.bloodBurst(
        z.x,
        z.y,
        Math.cos(a),
        Math.sin(a),
        SQUISH_SPRAY,
        BLOOD_SPRAY,
      );
      fx.bloodBurst(
        z.x,
        z.y,
        -Math.cos(a),
        -Math.sin(a),
        SQUISH_SPRAY,
        BLOOD_SPRAY,
      );
      horde.kill(z, "count");
    }
    for (const c of circles) this.keepOut.push(horde.addZone(c.x, c.y, c.r));
    audio.play("explosion", {
      pitch: 0.4,
      volume: crushed.size > 0 ? 0.6 : 0.35,
    });
    if (crushed.size > 0)
      audio.play("zombieTear", { pitch: rand(0.7, 0.85), volume: 0.9 });
    camera.addTrauma(crushed.size > 0 ? SQUISH_TRAUMA : LAND_TRAUMA);
  }

  /**
   * Landed: the turning blades chew the crowd at the body's edge. Each blade pass rolls for every
   * zombie in reach, rate-limited so it reads as a gory spectacle rather than a force field.
   */
  private slice(dt: number): void {
    this.chops = Math.min(
      RUN.sliceBurst,
      this.chops + RUN.slicesPerSecond * dt,
    );
    this.chopSound -= dt;
    this.bladeTurn += RUN.rotorSpin * dt;
    const pass = TWO_PI / BLADES;
    while (this.bladeTurn >= pass) {
      this.bladeTurn -= pass;
      if (this.chops < 1) continue;
      const r = RUN.sliceRadius;
      const { x, y } = this;
      this.inReach.length = 0;
      this.world.horde.hash.queryBox(x - r, y - r, x + r, y + r, (z) => {
        if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < r * r)
          this.inReach.push(z);
      });
      for (const z of this.inReach) {
        if (this.chops < 1) break;
        if (Math.random() >= RUN.sliceChance) continue;
        this.chops -= 1;
        this.chop(z);
      }
    }
  }

  /** Chop one zombie: limbs and head fly off along the blade, blood sprays after them, no reward. */
  private chop(z: Zombie): void {
    const { horde, fx, audio } = this.world;
    const d = Math.max(0.001, Math.hypot(z.x - this.x, z.y - this.y));
    const rx = (z.x - this.x) / d;
    const ry = (z.y - this.y) / d;
    // The rotor turns clockwise on screen, so a blade moves along (-ry, rx) where it meets the zombie.
    let fx0 = -ry + rx * FLING_OUT;
    let fy0 = rx + ry * FLING_OUT;
    const len = Math.hypot(fx0, fy0);
    fx0 /= len;
    fy0 /= len;
    z.kx = fx0 * RUN.sliceFling;
    z.ky = fy0 * RUN.sliceFling;
    let head = false;
    // A frozen zombie shatters in the horde's kill, its pieces flung along the blade; no gore here.
    const parts = z.frozen ? undefined : z.def.art.parts;
    for (let bit = 0; bit < PART_IDS.length; bit++) {
      if (!parts?.[PART_IDS[bit]] || z.missing & (1 << bit)) continue;
      if (Math.random() >= RUN.slicePartChance) continue;
      horde.limbs.launch(z, bit, fx0, fy0, this.stump);
      z.sever(bit);
      head ||= PART_IDS[bit] === "head";
      fx.bloodBurst(this.stump.x, this.stump.y, fx0, fy0, 10, BLOOD_SPRAY);
    }
    if (!z.frozen) {
      fx.bloodBurst(z.x, z.y, fx0, fy0, RUN.sliceSpray, BLOOD_SPRAY);
      for (let i = 0; i < 3; i++) horde.splat(z.x, z.y, fx0, fy0);
    }
    z.drop();
    horde.kill(z, "none");
    if (this.chopSound > 0) return;
    this.chopSound = RUN.chopSoundGap;
    audio.play("rotorChop", { pitch: rand(0.85, 1.15), volume: 0.8 });
    if (head)
      audio.play("zombieHeadPop", { pitch: rand(0.9, 1.2), volume: 0.6 });
  }

  private releaseKeepOut(): void {
    for (const zone of this.keepOut) this.world.horde.removeZone(zone);
    this.keepOut.length = 0;
  }

  private drawDebug(): void {
    this.debug.clear();
    if (!aiDebug.enabled) return;
    for (const c of this.footprint())
      this.debug.circle(c.x, c.y, c.r).stroke({ color: 0xff3df2, width: 2 });
  }

  /**
   * Near the ground, the rotor wash nudges zombies out from under the rotor. Returns the wash
   * strength, 0 to 1, which fades in below WASH_ALTITUDE.
   */
  private blow(dt: number): number {
    const wash = Math.max(0, 1 - this.altitude / WASH_ALTITUDE);
    if (wash <= 0) return 0;
    const r = RUN.washRadius;
    const { x, y } = this;
    this.world.horde.hash.queryBox(x - r, y - r, x + r, y + r, (z) => {
      if (z.dead) return;
      const dx = z.x - x;
      const dy = z.y - y;
      const d = Math.hypot(dx, dy);
      if (d >= r || d < 0.001) return;
      // Topped up against knockback drag, so the shove settles at washPush times the falloff.
      const push = RUN.washPush * (1 - d / r) * wash;
      z.push(dx / d, dy / d, push * KNOCKBACK_DRAG * dt);
    });
    return wash;
  }

  /** Dust thrown across the floor in proportion to the wash. */
  private kickDust(dt: number, wash: number): void {
    this.dustDebt += RUN.washDust * wash * dt;
    while (this.dustDebt >= 1) {
      this.dustDebt -= 1;
      this.puff();
    }
  }

  private puff(): void {
    const sprite =
      this.dustPool.pop() ??
      new Sprite({ texture: this.tex.blast.glow, anchor: 0.5 });
    sprite.tint = DUST_TINT;
    const angle = rand(0, Math.PI * 2);
    const start = rand(20, 50);
    const speed = rand(DUST_SPEED.min, DUST_SPEED.max);
    sprite.position.set(
      this.x + Math.cos(angle) * start,
      this.y + Math.sin(angle) * start,
    );
    this.dustLayer.addChild(sprite);
    this.dust.push({
      sprite,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: rand(DUST_LIFE.min, DUST_LIFE.max),
    });
  }

  private updateDust(dt: number): void {
    const drag = Math.exp(-dt * 2.5);
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.age += dt;
      const u = d.age / d.life;
      if (u >= 1) {
        this.dustLayer.removeChild(d.sprite);
        this.dustPool.push(d.sprite);
        this.dust[i] = this.dust[this.dust.length - 1];
        this.dust.pop();
        continue;
      }
      d.vx *= drag;
      d.vy *= drag;
      d.sprite.x += d.vx * dt;
      d.sprite.y += d.vy * dt;
      d.sprite.scale.set((12 + 26 * u) / BLAST_TEXTURE_RADIUS);
      d.sprite.alpha = 0.4 * (1 - u);
    }
  }

  /** Landing pad: a hazard ring with an H, a pulse ring rolling out, and the boarding ring filling. */
  private drawPad(): void {
    const r = RUN.zoneRadius;
    const segments = 16;
    this.pad.circle(0, 0, r).fill({ color: PAD_DARK, alpha: 0.35 });
    for (let i = 0; i < segments; i += 2) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      this.pad
        .arc(0, 0, r - 5, a0, a1)
        .stroke({ color: PAD, width: 8, cap: "butt" });
    }
    this.pad.circle(0, 0, r).stroke({ color: INK, width: 3 });
    this.pad.circle(0, 0, r - 10).stroke({ color: INK, width: 2 });
    const h = r * 0.5;
    const w = r * 0.36;
    const bar = r * 0.12;
    this.pad
      .rect(-w, -h, bar, h * 2)
      .rect(w - bar, -h, bar, h * 2)
      .rect(-w, -bar / 2, w * 2, bar)
      .fill(PAD)
      .stroke({ color: INK, width: 3 });
  }

  private updatePad(dt: number): void {
    const r = RUN.zoneRadius;
    const p = ((this.t + dt) % PULSE_SECONDS) / PULSE_SECONDS;
    const show = this.phase !== "depart";
    this.pad.visible = show;
    this.pulse.visible = show;
    this.pulse
      .clear()
      .circle(0, 0, r * (1 + p * 0.8))
      .stroke({ color: BEACON, width: 4, alpha: 0.8 * (1 - p) });
    this.progressRing.clear();
    if (this.boardProgress <= 0 || !show) return;
    this.progressRing
      .arc(
        0,
        0,
        r + 8,
        -Math.PI / 2,
        -Math.PI / 2 + this.boardProgress * Math.PI * 2,
      )
      .stroke({ color: BEACON, width: 8, cap: "round" });
  }
}

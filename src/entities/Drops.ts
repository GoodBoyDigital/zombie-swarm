import { Container, Graphics, Sprite } from "pixi.js";
import { DROP_RULES } from "../config/drops";
import {
  POWERUP_CATEGORIES,
  POWERUP_DEFS,
  POWERUP_DROPS,
  WEAPON_DROPS,
  type PowerupDef,
} from "../config/powerups";
import { BACKUP_WEAPON, type WeaponId } from "../config/weapons";
import { pickWeighted, rand } from "../core/random";
import type { Effects } from "../fx/Effects";
import type { GameTextures } from "../fx/textures";
import type { Arena } from "../world/Arena";
import type { Player } from "./Player";

/** Keep timed orbs this far inside the walls. */
const SPAWN_INSET = 80;
const INK = 0x151a15;
const OUTLINE = 3;
/** Widest an icon may get, as a fraction of the orb's inner diameter. */
const ICON_MAX_SPAN = 1.7;

interface Drop {
  view: Container;
  /** Stays on the ground while the orb bobs above it. */
  shadow: Graphics;
  glow: Graphics;
  /** Body and icon, bobbing together. */
  orb: Container;
  body: Graphics;
  icon: Sprite;
  def: PowerupDef;
  /** What the body was last drawn with, so tuning edits redraw it. */
  drawnColor: number;
  drawnRadius: number;
  x: number;
  y: number;
  life: number;
  bob: number;
}

/**
 * Power-up orbs: a filled circle in the category colour with a dark outline, a soft breathing glow,
 * a slow bob and the power-up's icon. Few exist at once, so each is a pooled Container of
 * Graphics. No vacuum: the player walks over them.
 */
export class Drops {
  readonly view = new Container();
  private readonly live: Drop[] = [];
  private readonly pool: Drop[] = [];
  private timer = DROP_RULES.timedSpawnSeconds;

  constructor(
    private readonly tex: GameTextures,
    private readonly arena: Arena,
    private readonly fx: Effects,
    private readonly onCollect: (def: PowerupDef, x: number, y: number) => void,
    /** The gun the player holds now, so gun drops know whether he's on the backup pistol. */
    private readonly heldWeapon: () => WeaponId,
  ) {}

  /** Which action the per-action budget below belongs to, and what it has dropped so far. */
  private volley = -1;
  private weaponsThisVolley = 0;
  private powerupsThisVolley = 0;

  /**
   * Roll for orbs where a zombie fell. Guns and power-ups roll separately, and each action
   * (`volley`: a trigger pull, a blast, a bomb) can drop only a few of each, however many it kills.
   */
  onKill(x: number, y: number, volley: number): void {
    if (volley !== this.volley) {
      this.volley = volley;
      this.weaponsThisVolley = 0;
      this.powerupsThisVolley = 0;
    }
    let dropped = false;
    const onBackup = this.heldWeapon() === BACKUP_WEAPON;
    const weaponChance =
      (onBackup
        ? DROP_RULES.weaponChanceOnBackup
        : DROP_RULES.weaponChanceArmed) *
      (this.gunWaiting() ? DROP_RULES.weaponChanceWhileWaiting : 1);
    if (
      this.weaponsThisVolley < DROP_RULES.maxWeaponsPerAction &&
      Math.random() < weaponChance
    ) {
      this.weaponsThisVolley++;
      this.spawn(this.pickWeapon(), x, y);
      dropped = true;
    }
    if (
      this.powerupsThisVolley < DROP_RULES.maxPowerupsPerAction &&
      Math.random() < DROP_RULES.powerupChancePerKill
    ) {
      this.powerupsThisVolley++;
      // Same kill dropped a gun too: set this one beside it rather than hiding it underneath.
      const nudge = dropped ? DROP_RULES.orbRadius * 2.4 : 0;
      this.spawn(pickWeighted(POWERUP_DROPS), x + nudge, y);
    }
  }

  /** A gun orb is already lying on the floor. */
  private gunWaiting(): boolean {
    return this.live.some((d) => d.def.category === "weapon");
  }

  /** A gun other than the one already in hand. */
  private pickWeapon(): PowerupDef {
    const held = this.heldWeapon();
    const options = WEAPON_DROPS.filter(
      (d) => !(d.effect === "equip" && d.weapon === held),
    );
    return pickWeighted(options.length > 0 ? options : WEAPON_DROPS);
  }

  /** Drop a specific orb, for testing and scripted drops. */
  drop(def: PowerupDef, x: number, y: number): void {
    this.spawn(def, x, y);
  }

  update(dt: number, player: Player): void {
    if (DROP_RULES.timedSpawnSeconds > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = DROP_RULES.timedSpawnSeconds;
        const b = this.arena.bounds;
        this.spawn(
          this.heldWeapon() === BACKUP_WEAPON && !this.gunWaiting()
            ? this.pickWeapon()
            : pickWeighted(POWERUP_DROPS),
          rand(b.minX + SPAWN_INSET, b.maxX - SPAWN_INSET),
          rand(b.minY + SPAWN_INSET, b.maxY - SPAWN_INSET),
        );
      }
    }
    const collect = player.radius + DROP_RULES.collectRadius;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.release(i);
        continue;
      }
      const dx = player.x - d.x;
      const dy = player.y - d.y;
      if (dx * dx + dy * dy < collect * collect) {
        this.collect(i);
        continue;
      }
      this.animate(d, dt);
    }
  }

  private animate(d: Drop, dt: number): void {
    const color = POWERUP_CATEGORIES[d.def.category].color;
    if (color !== d.drawnColor || DROP_RULES.orbRadius !== d.drawnRadius)
      this.draw(d);
    d.bob += dt * DROP_RULES.bobSpeed * Math.PI * 2;
    const s = Math.sin(d.bob);
    d.orb.y = -DROP_RULES.bobHeight * (1 + s);
    d.glow.y = d.orb.y;
    d.glow.scale.set(1 + s * DROP_RULES.glowPulse);
    d.glow.alpha = 0.75 + s * 0.25;
    d.shadow.scale.set(1 - s * 0.08);
    d.view.alpha =
      d.life < DROP_RULES.blinkSeconds && (d.life * 8) % 2 < 1 ? 0.3 : 1;
  }

  private spawn(def: PowerupDef, x: number, y: number): void {
    const d = this.pool.pop() ?? this.create();
    d.def = def;
    d.x = x;
    d.y = y;
    d.life = DROP_RULES.lifetime;
    d.bob = rand(0, Math.PI * 2);
    d.icon.texture = this.tex.powerupIcons[def.id];
    this.draw(d);
    d.view.position.set(x, y);
    d.view.alpha = 1;
    this.view.addChild(d.view);
    this.live.push(d);
    this.animate(d, 0);
  }

  /** Flat vector orb: fill with one darker cel-shade crescent, a highlight and a bold ink outline. */
  private draw(d: Drop): void {
    const r = DROP_RULES.orbRadius;
    const color = POWERUP_CATEGORIES[d.def.category].color;
    d.drawnColor = color;
    d.drawnRadius = r;
    d.shadow
      .clear()
      .ellipse(0, r * 0.55, r * 0.85, r * 0.32)
      .fill({ color: 0x000000, alpha: 0.28 });
    const g = d.glow.clear();
    const glow = r * DROP_RULES.glowSize;
    for (let i = 4; i >= 1; i--)
      g.circle(0, 0, r + ((glow - r) * i) / 4).fill({ color, alpha: 0.12 });
    const inner = r - OUTLINE;
    d.body
      .clear()
      .circle(0, 0, inner)
      .fill(shade(color, 0.72))
      .circle(-inner * 0.07, -inner * 0.09, inner * 0.88)
      .fill(color)
      .circle(0, 0, inner * 0.66)
      .fill({ color: 0xffffff, alpha: 0.22 })
      .ellipse(-inner * 0.42, -inner * 0.5, inner * 0.3, inner * 0.16)
      .fill({ color: 0xffffff, alpha: 0.7 })
      .circle(0, 0, inner)
      .stroke({ width: OUTLINE, color: INK, alignment: 0 });
    // Fit by area so long thin guns read as big as round icons, but never past the rim.
    const box = DROP_RULES.iconSize * r * 2;
    const t = d.icon.texture;
    d.icon.scale.set(
      Math.min(
        box / Math.sqrt(t.width * t.height),
        (inner * ICON_MAX_SPAN) / Math.max(t.width, t.height),
      ),
    );
  }

  private collect(index: number): void {
    const d = this.live[index];
    this.fx.sparkle(d.x, d.y, POWERUP_CATEGORIES[d.def.category].color, 18);
    this.onCollect(d.def, d.x, d.y);
    this.release(index);
  }

  private release(index: number): void {
    const d = this.live[index];
    this.view.removeChild(d.view);
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
    this.pool.push(d);
  }

  private create(): Drop {
    const view = new Container();
    const shadow = new Graphics();
    const glow = new Graphics();
    glow.blendMode = "add";
    const orb = new Container();
    const body = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    orb.addChild(body, icon);
    view.addChild(shadow, glow, orb);
    return {
      view,
      shadow,
      glow,
      orb,
      body,
      icon,
      def: POWERUP_DEFS[0],
      drawnColor: -1,
      drawnRadius: -1,
      x: 0,
      y: 0,
      life: 0,
      bob: 0,
    };
  }
}

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

import { Container, Sprite } from "pixi.js";
import type { Audio } from "../audio/Audio";
import { DROP_DEFS, DROP_RULES, type DropDef } from "../config/drops";
import { pickWeighted, rand } from "../core/random";
import type { Effects } from "../fx/Effects";
import type { GameTextures } from "../fx/textures";
import type { Arena } from "../world/Arena";
import type { Player } from "./Player";

/** Keep timed crates this far inside the walls. */
const SPAWN_INSET = 80;
/** Where the icon sits on the crate, in px above its centre. */
const ICON_LIFT = 2;
const SPARKLE = 0xfff1c2;

interface Drop {
  view: Container;
  icon: Sprite;
  def: DropDef;
  x: number;
  y: number;
  life: number;
  bob: number;
}

/**
 * Weapon crates (and later power-ups). Few exist at once, so each is an ordinary pooled
 * Container of crate plus icon. No vacuum: the player walks over them.
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
    private readonly audio: Audio,
    private readonly onCollect: (def: DropDef) => void,
  ) {}

  /** Roll for a crate where a zombie fell. */
  onKill(x: number, y: number): void {
    if (Math.random() < DROP_RULES.chancePerKill)
      this.spawn(pickWeighted(DROP_DEFS), x, y);
  }

  update(dt: number, player: Player): void {
    if (DROP_RULES.timedSpawnSeconds > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = DROP_RULES.timedSpawnSeconds;
        const b = this.arena.bounds;
        this.spawn(
          pickWeighted(DROP_DEFS),
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
      d.bob += dt * DROP_RULES.bobSpeed * Math.PI * 2;
      d.icon.y = -ICON_LIFT + Math.sin(d.bob) * DROP_RULES.bobHeight;
      d.view.alpha =
        d.life < DROP_RULES.blinkSeconds && (d.life * 8) % 2 < 1 ? 0.3 : 1;
    }
  }

  private spawn(def: DropDef, x: number, y: number): void {
    const d = this.pool.pop() ?? this.create();
    d.def = def;
    d.x = x;
    d.y = y;
    d.life = DROP_RULES.lifetime;
    d.bob = rand(0, Math.PI * 2);
    // Power-ups will get their own icon set; until then the crate shows nothing for them.
    d.icon.visible = def.kind === "weapon";
    if (def.kind === "weapon")
      d.icon.texture = this.tex.weaponIcons[def.weapon];
    d.view.position.set(x, y);
    d.view.alpha = 1;
    this.view.addChild(d.view);
    this.live.push(d);
  }

  private collect(index: number): void {
    const d = this.live[index];
    this.audio.play("pickupWeapon", { volume: 0.7 });
    this.fx.sparkle(d.x, d.y, SPARKLE, 14);
    this.onCollect(d.def);
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
    const crate = new Sprite(this.tex.crate);
    crate.anchor.set(0.5);
    const icon = new Sprite();
    icon.anchor.set(0.5);
    view.addChild(crate, icon);
    return { view, icon, def: DROP_DEFS[0], x: 0, y: 0, life: 0, bob: 0 };
  }
}

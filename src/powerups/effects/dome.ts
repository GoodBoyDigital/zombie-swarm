import type { EffectDef } from "../../config/powerups";
import { rand } from "../../core/random";
import type { ExclusionZone } from "../../entities/Horde";
import type { Zombie } from "../../entities/Zombie";
import { ElectricDome } from "../../fx/ElectricDome";
import type { ActivePowerup, PowerupContext } from "../PowerupContext";

/** What the shield and the safety portal share: an exclusion zone drawn as an electric dome. */
type DomeDef = EffectDef<"shield"> | EffectDef<"portal">;

export interface DomeState {
  zone: ExclusionZone;
  dome: ElectricDome;
  /** Sparks and bolts left to spend; refills over time so a pressed crowd doesn't flood the screen. */
  sparks: number;
  zapCooldown: number;
}

const SPARK_COLOR = 0x8cefff;
const SPARKS_PER_SECOND = 24;
const SPARK_BANK = 6;
/** Fraction of edge contacts that try to spark, so they scatter round the rim. */
const SPARK_CHANCE = 0.3;
/** Least gap between zaps, seconds. */
const ZAP_INTERVAL = 0.12;
const HUM_VOLUME = 0.3;

/**
 * Open a dome at (x, y). It grows from nothing over `openSeconds`, shoving anyone inside out to the
 * edge. `onContact` runs for every zombie pressed against it, after the shared spark and zap; return
 * true when the touch should always spark (a shove).
 */
export function openDome(
  ctx: PowerupContext,
  def: DomeDef,
  x: number,
  y: number,
  onContact?: (z: Zombie, nx: number, ny: number) => boolean,
): DomeState {
  const dome = new ElectricDome();
  dome.x = x;
  dome.y = y;
  dome.ripple = def.ripple;
  ctx.world.addChild(dome.view);
  const zone = ctx.horde.addZone(x, y, 0);
  const state: DomeState = { zone, dome, sparks: SPARK_BANK, zapCooldown: 0 };
  zone.onContact = (z, nx, ny) => {
    const forced = onContact?.(z, nx, ny) ?? false;
    if (state.sparks < 1 || (!forced && Math.random() > SPARK_CHANCE)) return;
    state.sparks--;
    const r = z.def.radius;
    ctx.fx.sparkle(z.x - nx * r, z.y - ny * r, SPARK_COLOR, 3);
    dome.touch(z.x, z.y);
    if (state.zapCooldown > 0) return;
    state.zapCooldown = ZAP_INTERVAL;
    ctx.audio.play("shieldZap", { volume: 0.3, pitch: rand(0.85, 1.25) });
  };
  ctx.audio.play("shieldOpen", { volume: 0.7 });
  ctx.fx.sparkle(x, y, SPARK_COLOR, 14);
  // The hum lives as long as the dome's view, so a restart mid-dome silences it too.
  const stopHum = ctx.audio.loop("shieldHum", HUM_VOLUME);
  dome.view.once("destroyed", stopHum);
  return state;
}

/** Grow, flicker near the end, refill the spark bank and redraw. Position the zone and dome first. */
export function updateDome(
  def: DomeDef,
  dt: number,
  active: ActivePowerup<DomeState>,
): void {
  const { zone, dome } = active.state;
  const open = Math.min(1, active.age / def.openSeconds);
  zone.radius = def.radius * easeOutBack(open);
  dome.radius = zone.radius;
  dome.ripple = def.ripple;
  dome.visibility = flicker(active, def.flickerSeconds);
  active.state.sparks = Math.min(
    SPARK_BANK,
    active.state.sparks + SPARKS_PER_SECOND * dt,
  );
  active.state.zapCooldown -= dt;
  dome.update(dt);
}

export function closeDome(ctx: PowerupContext, state: DomeState): void {
  ctx.horde.removeZone(state.zone);
  ctx.fx.sparkle(state.dome.x, state.dome.y, SPARK_COLOR, 10);
  state.dome.destroy();
  ctx.audio.play("shieldClose", { volume: 0.7 });
}

/** Steady until the last `seconds`, then blinking faster and dimmer as time runs out. */
function flicker(active: ActivePowerup, seconds: number): number {
  if (active.left >= seconds || seconds <= 0) return 1;
  const t = active.left / seconds;
  const rate = 5 + 20 * (1 - t);
  const on = (active.age * rate) % 1 < 0.45 + 0.4 * t;
  return on ? 1 : 0.2;
}

/** Overshoots a little before settling, so the dome pops open. */
function easeOutBack(t: number): number {
  const c = 1.6;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

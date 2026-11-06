import { Pane, type FolderApi } from "tweakpane";
import { CONFIG_UPDATED } from "./hotConfig";
import { CASINGS } from "../config/casings";
import { DISMEMBER } from "../config/dismember";
import { DROP_RULES } from "../config/drops";
import { EXPLOSIONS } from "../config/explosions";
import { ICE } from "../config/ice";
import { LOOT, LOOT_RULES } from "../config/loot";
import { PLAYER } from "../config/player";
import { CAMERA } from "../config/camera";
import { CONTROLS } from "../config/controls";
import { LEVELS, RUN } from "../config/run";
import {
  POWERUP_CATEGORIES,
  POWERUP_DEFS,
  POWERUPS,
  type PowerupDef,
} from "../config/powerups";
import { WEAPONS } from "../config/weapons";
import { SPAWN, ZOMBIE_AI } from "../config/zombies";

/** Slider limits per numeric field. Fields without an entry get a plain number box. */
type Ranges = Record<string, { min: number; max: number; step?: number }>;

/** A def table (`WEAPONS`) nests one object per entry; a rules object (`LOOT_RULES`) is flat. */
interface Table {
  exportName: string;
  /** Emitted as `satisfies Record<string, T>`; null for flat rule objects. */
  typeName: string | null;
  obj: Record<string, unknown>;
}

const LOOT_RANGES: Ranges = {
  value: { min: 1, max: 100, step: 1 },
  size: { min: 4, max: 48, step: 1 },
  inheritVelocity: { min: 0, max: 2, step: 0.05 },
  weight: { min: 0, max: 100, step: 1 },
  burstMin: { min: 0, max: 12, step: 1 },
  burstMax: { min: 0, max: 12, step: 1 },
  scatterMin: { min: 0, max: 600, step: 10 },
  scatterMax: { min: 0, max: 600, step: 10 },
  friction: { min: 0.5, max: 20, step: 0.1 },
  hopMin: { min: 0, max: 500, step: 10 },
  hopMax: { min: 0, max: 500, step: 10 },
  lifetime: { min: 1, max: 120, step: 1 },
  blinkSeconds: { min: 0, max: 10, step: 0.5 },
  maxItems: { min: 100, max: 10000, step: 100 },
  magnetRadius: { min: 0, max: 400, step: 5 },
  magnetPull: { min: 0, max: 3000, step: 10 },
  magnetMaxSpeed: { min: 10, max: 600, step: 10 },
  collectRadius: { min: 0, max: 60, step: 1 },
  weaponChanceOnBackup: { min: 0, max: 1, step: 0.005 },
  weaponChanceArmed: { min: 0, max: 1, step: 0.001 },
  weaponChanceWhileWaiting: { min: 0, max: 1, step: 0.01 },
  powerupChancePerKill: { min: 0, max: 1, step: 0.005 },
  maxPowerupOrbs: { min: 0, max: 20, step: 1 },
  orbSpacing: { min: 0, max: 600, step: 10 },
  maxWeaponsPerAction: { min: 0, max: 10, step: 1 },
  maxPowerupsPerAction: { min: 0, max: 10, step: 1 },
  bobHeight: { min: 0, max: 10, step: 0.5 },
  bobSpeed: { min: 0, max: 10, step: 0.1 },
  orbRadius: { min: 8, max: 60, step: 1 },
  iconSize: { min: 0.2, max: 1.2, step: 0.02 },
  glowSize: { min: 1, max: 3, step: 0.05 },
  glowPulse: { min: 0, max: 0.5, step: 0.01 },
};

const PLAYER_RANGES: Ranges = {
  ...LOOT_RANGES,
  maxHealth: { min: 1, max: 500, step: 1 },
  recoilGrip: { min: 5, max: 40, step: 0.5 },
  contactDamage: { min: 0, max: 30, step: 0.1 },
  crowdPower: { min: 1, max: 3, step: 0.05 },
  contactMargin: { min: 0, max: 30, step: 1 },
  invulnSeconds: { min: 0, max: 2, step: 0.05 },
  regenPerSecond: { min: 0, max: 50, step: 0.5 },
  regenDelay: { min: 0, max: 20, step: 0.5 },
};

const CAMERA_RANGES: Ranges = {
  viewHeight: { min: 200, max: 720, step: 10 },
  followRate: { min: 0.5, max: 20, step: 0.5 },
  edgeReveal: { min: 0, max: 120, step: 2 },
};

const CONTROLS_RANGES: Ranges = {
  stickRadius: { min: 30, max: 120, step: 1 },
  knobRadius: { min: 10, max: 80, step: 1 },
  stickAlpha: { min: 0.1, max: 1, step: 0.05 },
  moveDeadzone: { min: 0, max: 0.6, step: 0.01 },
  aimDeadzone: { min: 0, max: 0.8, step: 0.01 },
  gamepadDeadzone: { min: 0, max: 0.6, step: 0.01 },
  triggerThreshold: { min: 0.05, max: 0.95, step: 0.05 },
  aimDistance: { min: 40, max: 400, step: 5 },
  aimLine: { min: 0, max: 1, step: 0.05 },
  aimLineAlpha: { min: 0, max: 1, step: 0.05 },
  lockOnCone: { min: 0.05, max: 1.2, step: 0.01 },
  lockOnRange: { min: 50, max: 900, step: 10 },
  lockOnHold: { min: 0, max: 1, step: 0.05 },
  touchEdgeReveal: { min: 0, max: 1, step: 0.05 },
};

const ZOMBIE_AI_RANGES: Ranges = {
  wanderSpeedScale: { min: 0, max: 1.5, step: 0.05 },
  turnNoise: { min: 0, max: 4, step: 0.05 },
  retargetIntervalMin: { min: 0.2, max: 10, step: 0.1 },
  retargetIntervalMax: { min: 0.2, max: 10, step: 0.1 },
  wanderLegMin: { min: 20, max: 1000, step: 10 },
  wanderLegMax: { min: 20, max: 1000, step: 10 },
  aggroRadius: { min: 0, max: 800, step: 10 },
  fewChaseAll: { min: 0, max: 50, step: 1 },
  reactionDelayMin: { min: 0, max: 2, step: 0.05 },
  reactionDelayMax: { min: 0, max: 2, step: 0.05 },
  loseRadius: { min: 0, max: 1200, step: 10 },
  loseInterestSeconds: { min: 0, max: 20, step: 0.5 },
  loseInterestJitter: { min: 0, max: 5, step: 0.1 },
  herdCohesion: { min: 0, max: 2, step: 0.05 },
  herdAlignment: { min: 0, max: 2, step: 0.05 },
  herdCrowdLimit: { min: 1, max: 20, step: 1 },
  wanderTurnRate: { min: 0.5, max: 10, step: 0.1 },
  chaseTurnRate: { min: 0.5, max: 20, step: 0.1 },
  maxTurnRate: { min: 1, max: 20, step: 0.5 },
  shuffle: { min: 0, max: 1, step: 0.05 },
  stepLength: { min: 5, max: 120, step: 1 },
  sway: { min: 0, max: 0.3, step: 0.01 },
  squash: { min: 0, max: 0.15, step: 0.01 },
};

const POWERUP_RANGES: Ranges = {
  weight: { min: 0, max: 20, step: 0.5 },
  heal: { min: 0, max: 200, step: 5 },
  screenFlash: { min: 0, max: 1, step: 0.05 },
  screenFlashSeconds: { min: 0.05, max: 3, step: 0.05 },
  radius: { min: 20, max: 300, step: 2 },
  shove: { min: 0, max: 600, step: 10 },
  openSeconds: { min: 0.05, max: 2, step: 0.05 },
  flickerSeconds: { min: 0, max: 5, step: 0.1 },
  ripple: { min: 0, max: 30, step: 0.5 },
  seconds: { min: 0.25, max: 60, step: 0.05 },
  moveSpeed: { min: 0.2, max: 4, step: 0.05 },
  fireInterval: { min: 0.1, max: 2, step: 0.05 },
  damage: { min: 0.5, max: 6, step: 0.25 },
  magnetRadius: { min: 0.5, max: 10, step: 0.25 },
  magnetPull: { min: 0.5, max: 10, step: 0.25 },
  spread: { min: 0, max: 3, step: 0.05 },
  warningSeconds: { min: 0, max: 2, step: 0.05 },
  planeSpeed: { min: 200, max: 3000, step: 25 },
  bombs: { min: 1, max: 24, step: 1 },
  bombSpacing: { min: 20, max: 300, step: 5 },
  bombDelay: { min: 0, max: 1.5, step: 0.05 },
  bombSpread: { min: 0, max: 150, step: 5 },
  bombJitter: { min: 0, max: 100, step: 5 },
  lastBombScale: { min: 1, max: 3, step: 0.05 },
  shakeBudget: { min: 0, max: 4, step: 0.05 },
  strafeBursts: { min: 0, max: 8, step: 1 },
  strafeRounds: { min: 1, max: 20, step: 1 },
  strafeDamage: { min: 0, max: 20, step: 0.5 },
  armSeconds: { min: 0, max: 5, step: 0.1 },
  lureRadius: { min: 0, max: 2000, step: 25 },
  springSeconds: { min: 0.05, max: 2, step: 0.05 },
  pulseSpeed: { min: 50, max: 2000, step: 10 },
  pulseSeconds: { min: 0.2, max: 6, step: 0.1 },
  keepOutRadius: { min: 10, max: 200, step: 1 },
  warnSeconds: { min: 0, max: 3, step: 0.1 },
  shreds: { min: 0, max: 150, step: 1 },
  shredSpeed: { min: 50, max: 1200, step: 10 },
  shredLift: { min: 0, max: 600, step: 5 },
  shredSpin: { min: 0, max: 30, step: 0.5 },
  shredScale: { min: 0.5, max: 4, step: 0.1 },
  shredEyeScale: { min: 0.3, max: 4, step: 0.1 },
  freezeSeconds: { min: 0.5, max: 30, step: 0.5 },
  thawWarningSeconds: { min: 0, max: 5, step: 0.1 },
  blastDamage: { min: 0, max: 30, step: 0.5 },
  knockback: { min: 0, max: 2000, step: 10 },
  blastSeconds: { min: 0.1, max: 2, step: 0.05 },
  crystals: { min: 0, max: 150, step: 1 },
  frostMark: { min: 0, max: 2, step: 0.05 },
  shake: { min: 0, max: 2, step: 0.05 },
  bladesPerSecond: { min: 6, max: 400, step: 2 },
  spinRate: { min: 0, max: 6, step: 0.05 },
  arms: { min: 1, max: 8, step: 1 },
  bladeSpeed: { min: 100, max: 1500, step: 10 },
  bladeDamage: { min: 0, max: 30, step: 0.5 },
  bladePierce: { min: 1, max: 20, step: 1 },
  bladeKnockback: { min: 0, max: 1200, step: 10 },
  dismemberScale: { min: 0, max: 4, step: 0.1 },
  discRadius: { min: 6, max: 60, step: 1 },
  bladeScale: { min: 0.1, max: 1.5, step: 0.05 },
  bladeHitScale: { min: 0.1, max: 1.5, step: 0.05 },
  bladeBlood: { min: 0, max: 80, step: 1 },
  dropHeight: { min: 0, max: 40, step: 1 },
  skidDistance: { min: 0, max: 120, step: 1 },
  settleSeconds: { min: 0.05, max: 2, step: 0.05 },
};

const ICE_RANGES: Ranges = {
  hitRadius: { min: 0.4, max: 2, step: 0.02 },
  blockSize: { min: 0.5, max: 1.5, step: 0.02 },
  blockJitter: { min: 0, max: 0.4, step: 0.01 },
  blockTilt: { min: 0, max: 1, step: 0.01 },
  blockAlpha: { min: 0, max: 1, step: 0.01 },
  flashSeconds: { min: 0, max: 0.5, step: 0.01 },
  flickerRate: { min: 1, max: 40, step: 0.5 },
  shake: { min: 0, max: 4, step: 0.1 },
  shatterShards: { min: 0, max: 60, step: 1 },
  thawShards: { min: 0, max: 30, step: 1 },
  limbChance: { min: 0, max: 1, step: 0.05 },
  chunks: { min: 0, max: 20, step: 1 },
  chunkScale: { min: 0.2, max: 3, step: 0.05 },
  splatScale: { min: 0.2, max: 5, step: 0.1 },
  minFling: { min: 0, max: 600, step: 10 },
  soundGap: { min: 0, max: 0.5, step: 0.01 },
};

const EXPLOSION_RANGES: Ranges = {
  radius: { min: 10, max: 900, step: 5 },
  damage: { min: 0, max: 100, step: 0.5 },
  knockback: { min: 0, max: 4000, step: 25 },
  falloff: { min: 0, max: 1, step: 0.05 },
  flash: { min: 0, max: 2, step: 0.05 },
  ring: { min: 0, max: 2, step: 0.05 },
  seconds: { min: 0.1, max: 3, step: 0.05 },
  debris: { min: 0, max: 200, step: 1 },
  shake: { min: 0, max: 2, step: 0.05 },
  scorch: { min: 0, max: 2, step: 0.05 },
  noiseRadius: { min: 0, max: 2000, step: 25 },
  volume: { min: 0, max: 1.5, step: 0.05 },
  pitch: { min: 0.3, max: 2, step: 0.05 },
};

const SPAWN_RANGES: Ranges = {
  at: { min: 0, max: 1, step: 0.01 },
  rate: { min: 0, max: 40, step: 0.1 },
  inboundRate: { min: 0, max: 60, step: 0.5 },
  landedRate: { min: 0, max: 60, step: 0.5 },
  maxAlive: { min: 10, max: 2000, step: 10 },
};

const RUN_RANGES: Ranges = {
  seconds: { min: 10, max: 1200, step: 5 },
  zombieHealth: { min: 0.25, max: 5, step: 0.05 },
  spawnRate: { min: 0.25, max: 4, step: 0.05 },
  mixLead: { min: 0, max: 1, step: 0.05 },
  bruteWeight: { min: 0, max: 10, step: 0.1 },
  finalSeconds: { min: 0, max: 180, step: 5 },
  rotorLeadSeconds: { min: 0, max: 60, step: 1 },
  approachSeconds: { min: 1, max: 20, step: 0.5 },
  descendSeconds: { min: 0.5, max: 10, step: 0.25 },
  boardSeconds: { min: 0, max: 5, step: 0.1 },
  zoneRadius: { min: 20, max: 200, step: 5 },
  washRadius: { min: 0, max: 400, step: 10 },
  washPush: { min: 0, max: 800, step: 10 },
  washDust: { min: 0, max: 200, step: 5 },
  departSeconds: { min: 0.5, max: 8, step: 0.25 },
  farBias: { min: 0, max: 6, step: 0.25 },
};

const CASING_RANGES: Ranges = {
  width: { min: 1, max: 40, step: 1 },
};

const DISMEMBER_RANGES: Ranges = {
  leftArmChance: { min: 0, max: 1, step: 0.01 },
  rightArmChance: { min: 0, max: 1, step: 0.01 },
  headChance: { min: 0, max: 1, step: 0.01 },
  launchSpeedMin: { min: 0, max: 800, step: 10 },
  launchSpeedMax: { min: 0, max: 800, step: 10 },
  launchSpread: { min: 0, max: 1.5, step: 0.05 },
  inheritKnockback: { min: 0, max: 2, step: 0.05 },
  hopMin: { min: 0, max: 600, step: 10 },
  hopMax: { min: 0, max: 600, step: 10 },
  gravity: { min: 100, max: 3000, step: 50 },
  spinMin: { min: 0, max: 40, step: 0.5 },
  spinMax: { min: 0, max: 40, step: 0.5 },
  bounce: { min: 0, max: 0.9, step: 0.05 },
  bounceFriction: { min: 0, max: 1, step: 0.05 },
  floorDrag: { min: 0.5, max: 20, step: 0.5 },
  pieceScale: { min: 0.5, max: 3, step: 0.05 },
  spurt: { min: 0, max: 60, step: 1 },
  headSpurt: { min: 0, max: 80, step: 1 },
  headHopScale: { min: 0.5, max: 3, step: 0.05 },
  headSpinScale: { min: 0.5, max: 4, step: 0.05 },
  maxLive: { min: 1, max: 300, step: 1 },
};

const WEAPON_RANGES: Ranges = {
  pellets: { min: 1, max: 24, step: 1 },
  spread: { min: 0, max: 0.6, step: 0.005 },
  spreadBloom: { min: 0, max: 1, step: 0.01 },
  spreadMax: { min: 0, max: 0.6, step: 0.005 },
  fireInterval: { min: 0.02, max: 1.5, step: 0.005 },
  magazine: { min: 1, max: 300, step: 1 },
  magazines: { min: 1, max: 20, step: 1 },
  reloadSeconds: { min: 0.1, max: 6, step: 0.05 },
  damage: { min: 0.5, max: 30, step: 0.5 },
  knockback: { min: 0, max: 1500, step: 10 },
  recoil: { min: 0, max: 1000, step: 10 },
  range: { min: 20, max: 3000, step: 10 },
  shake: { min: 0, max: 1, step: 0.01 },
  tracerWidth: { min: 1, max: 16, step: 0.5 },
  noiseRadius: { min: 0, max: 1500, step: 10 },
  cone: { min: 0.05, max: 1.2, step: 0.01 },
  jumps: { min: 0, max: 30, step: 1 },
  jumpRadius: { min: 20, max: 250, step: 5 },
  falloff: { min: 0, max: 1, step: 0.01 },
  stun: { min: 0, max: 2, step: 0.05 },
  arc: { min: 0.1, max: 1.6, step: 0.01 },
  moveScale: { min: 0.1, max: 1, step: 0.05 },
  spray: { min: 0, max: 30, step: 1 },
  chunks: { min: 0, max: 10, step: 1 },
  splats: { min: 0, max: 10, step: 1 },
  cutShake: { min: 0, max: 1, step: 0.01 },
  speed: { min: 100, max: 2000, step: 10 },
  tumble: { min: 0, max: 30, step: 0.5 },
  dismemberScale: { min: 0, max: 5, step: 0.05 },
  glowSize: { min: 1, max: 40, step: 0.5 },
  glowIdle: { min: 0, max: 1, step: 0.01 },
  glowFiring: { min: 0, max: 1, step: 0.01 },
  glowFiringScale: { min: 1, max: 5, step: 0.05 },
  glowRampUp: { min: 0.01, max: 1, step: 0.01 },
  glowRampDown: { min: 0.01, max: 2, step: 0.01 },
  idleSparks: { min: 0, max: 30, step: 0.5 },
  firingSparks: { min: 0, max: 120, step: 1 },
  smokeInterval: { min: 0.02, max: 1, step: 0.01 },
  smokeCutInterval: { min: 0.02, max: 1, step: 0.01 },
  smokeSize: { min: 0.5, max: 12, step: 0.25 },
  smokeCutSize: { min: 0.5, max: 12, step: 0.25 },
  smokeGrow: { min: 1, max: 6, step: 0.1 },
  smokeAlpha: { min: 0, max: 1, step: 0.01 },
  smokeCutAlpha: { min: 0, max: 1, step: 0.01 },
  smokeKick: { min: 0, max: 300, step: 2 },
  smokeCutKick: { min: 0, max: 300, step: 2 },
  smokeLife: { min: 0.1, max: 3, step: 0.05 },
  spinUp: { min: 0, max: 2, step: 0.05 },
};

/**
 * Backtick toggles an overlay bound straight to the live config records, so edits apply on the
 * next shot. "Copy" puts the table on the clipboard as the exact `src/config/*.ts` source block,
 * ready to paste over the original. Register more tables in `setupTuning`.
 */
export class TuningPanel {
  private readonly pane = new Pane({ title: "Tuning (` to hide)" });
  private readonly tables: Table[] = [];
  private readonly status = { copied: "" };

  constructor() {
    this.pane.hidden = true;
    // Config hot-reloaded from disk: show the new values in the bound sliders.
    window.addEventListener(CONFIG_UPDATED, () => this.pane.refresh());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Backquote") this.pane.hidden = !this.pane.hidden;
    });
  }

  add(
    exportName: string,
    typeName: string | null,
    obj: Record<string, unknown>,
    ranges: Ranges,
  ): void {
    const table = { exportName, typeName, obj };
    this.tables.push(table);
    const folder = this.pane.addFolder({ title: exportName, expanded: false });
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== "object" || value === null) continue;
      const sub = folder.addFolder({ title: key, expanded: false });
      this.bindNumbers(sub, value as Record<string, unknown>, ranges);
    }
    this.bindNumbers(folder, obj, ranges);
    folder
      .addButton({ title: `Copy ${exportName} as source` })
      .on("click", () => this.copy(table));
    if (this.tables.length === 1)
      this.pane.addBinding(this.status, "copied", { readonly: true });
  }

  private bindNumbers(
    folder: FolderApi,
    def: Record<string, unknown>,
    ranges: Ranges,
  ): void {
    for (const key of Object.keys(def)) {
      const value = def[key];
      // Nested objects (a power-up's modifiers) get their own sub-folder.
      if (typeof value === "object" && value !== null) {
        const sub = folder.addFolder({ title: key, expanded: true });
        this.bindNumbers(sub, value as Record<string, unknown>, ranges);
        continue;
      }
      if (typeof value === "boolean") {
        folder.addBinding(def, key);
        continue;
      }
      if (typeof value !== "number") continue;
      // Infinity (railgun pierce) breaks number inputs, so it gets a checkbox instead.
      if (!Number.isFinite(value) || key === "pierce") {
        this.bindPierce(folder, def, key);
        continue;
      }
      // Colour fields get a swatch; the source copy writes them back as hex.
      if (isColor(key)) folder.addBinding(def, key, { view: "color" });
      else folder.addBinding(def, key, ranges[key]);
    }
  }

  /** Pierce is a count or "everything"; the checkbox swaps between a finite box and Infinity. */
  private bindPierce(
    folder: FolderApi,
    def: Record<string, unknown>,
    key: string,
  ): void {
    const proxy = {
      all: def[key] === Infinity,
      count: def[key] === Infinity ? 1 : (def[key] as number),
    };
    const apply = () => {
      def[key] = proxy.all ? Infinity : proxy.count;
    };
    folder
      .addBinding(proxy, "all", { label: `${key} all` })
      .on("change", apply);
    folder
      .addBinding(proxy, "count", { label: key, min: 1, max: 20, step: 1 })
      .on("change", apply);
  }

  /**
   * A folder at the top with a button per power-up that drops its orb ahead of the player, plus the
   * airstrike's settings and its bomb blast (the same live objects as POWERUPS and EXPLOSIONS).
   */
  addDrops(drop: (def: PowerupDef) => void): void {
    const folder = this.pane.addFolder({ title: "Drop power-up", index: 0 });
    for (const def of POWERUP_DEFS)
      folder.addButton({ title: def.name }).on("click", () => drop(def));
    const strike = this.pane.addFolder({
      title: "Airstrike",
      expanded: false,
      index: 1,
    });
    this.bindNumbers(strike, POWERUPS.airstrike, POWERUP_RANGES);
    const bomb = strike.addFolder({ title: "bomb blast", expanded: false });
    this.bindNumbers(bomb, EXPLOSIONS.airstrikeBomb, EXPLOSION_RANGES);
  }

  private async copy(table: Table): Promise<void> {
    const text = toSource(table);
    try {
      await navigator.clipboard.writeText(text);
      this.status.copied = `${table.exportName} copied`;
    } catch {
      // Clipboard needs focus and a secure context; fall back to logging so nothing is lost.
      console.log(text);
      this.status.copied = "copy failed, see console";
    }
  }
}

/** Mirror the hand-written shape of src/config/*.ts, including Infinity, which JSON cannot carry. */
function toSource({ exportName, typeName, obj }: Table): string {
  const lines = [`export const ${exportName} = {`];
  pushFields(lines, obj, "  ");
  lines.push(
    typeName
      ? `} as const satisfies Record<string, ${typeName}>;`
      : "} as const;",
  );
  return lines.join("\n") + "\n";
}

function pushFields(
  lines: string[],
  obj: Record<string, unknown>,
  indent: string,
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`${indent}${key}: {`);
      pushFields(lines, value as Record<string, unknown>, indent + "  ");
      lines.push(`${indent}},`);
    } else lines.push(`${indent}${key}: ${literal(value, key)},`);
  }
}

const isColor = (key: string): boolean => /color$/i.test(key);

function literal(value: unknown, key: string): string {
  if (typeof value === "number") {
    if (isColor(key)) return `0x${value.toString(16).padStart(6, "0")}`;
    return Number.isFinite(value) ? String(value) : "Infinity";
  }
  return JSON.stringify(value);
}

export function setupTuning(): TuningPanel {
  const panel = new TuningPanel();
  panel.add("WEAPONS", "WeaponDef", WEAPONS, WEAPON_RANGES);
  panel.add("LOOT", "LootDef", LOOT, LOOT_RANGES);
  panel.add("LOOT_RULES", null, LOOT_RULES, LOOT_RANGES);
  panel.add("PLAYER", null, PLAYER, PLAYER_RANGES);
  panel.add("DROP_RULES", null, DROP_RULES, LOOT_RANGES);
  panel.add("POWERUPS", "PowerupDef", POWERUPS, POWERUP_RANGES);
  panel.add("POWERUP_CATEGORIES", "CategoryDef", POWERUP_CATEGORIES, {});
  panel.add("EXPLOSIONS", "ExplosionDef", EXPLOSIONS, EXPLOSION_RANGES);
  panel.add("ZOMBIE_AI", null, ZOMBIE_AI, ZOMBIE_AI_RANGES);
  panel.add("SPAWN", null, SPAWN, SPAWN_RANGES);
  panel.add("LEVELS", null, { ...LEVELS }, RUN_RANGES);
  panel.add("RUN", null, RUN, RUN_RANGES);
  panel.add("DISMEMBER", null, DISMEMBER, DISMEMBER_RANGES);
  panel.add("ICE", null, ICE, ICE_RANGES);
  panel.add("CASINGS", "CasingDef", CASINGS, CASING_RANGES);
  panel.add("CAMERA", null, CAMERA, CAMERA_RANGES);
  panel.add("CONTROLS", null, CONTROLS, CONTROLS_RANGES);
  return panel;
}

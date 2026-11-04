import { Pane, type FolderApi } from "tweakpane";
import { CASINGS } from "../config/casings";
import { DROP_RULES, DROPS } from "../config/drops";
import { LOOT, LOOT_RULES } from "../config/loot";
import { PLAYER } from "../config/player";
import { WEAPONS } from "../config/weapons";
import { ZOMBIE_AI } from "../config/zombies";

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
  collectRadius: { min: 0, max: 60, step: 1 },
  chancePerKill: { min: 0, max: 1, step: 0.005 },
  timedSpawnSeconds: { min: 0, max: 120, step: 1 },
  bobHeight: { min: 0, max: 10, step: 0.5 },
  bobSpeed: { min: 0, max: 10, step: 0.1 },
};

const ZOMBIE_AI_RANGES: Ranges = {
  wanderSpeedScale: { min: 0, max: 1.5, step: 0.05 },
  turnNoise: { min: 0, max: 4, step: 0.05 },
  retargetIntervalMin: { min: 0.2, max: 10, step: 0.1 },
  retargetIntervalMax: { min: 0.2, max: 10, step: 0.1 },
  wanderLegMin: { min: 20, max: 1000, step: 10 },
  wanderLegMax: { min: 20, max: 1000, step: 10 },
  aggroRadius: { min: 0, max: 800, step: 10 },
  reactionDelayMin: { min: 0, max: 2, step: 0.05 },
  reactionDelayMax: { min: 0, max: 2, step: 0.05 },
  loseRadius: { min: 0, max: 1200, step: 10 },
  loseInterestSeconds: { min: 0, max: 20, step: 0.5 },
  loseInterestJitter: { min: 0, max: 5, step: 0.1 },
  herdCohesion: { min: 0, max: 2, step: 0.05 },
  herdAlignment: { min: 0, max: 2, step: 0.05 },
};

const CASING_RANGES: Ranges = {
  width: { min: 1, max: 20, step: 1 },
  height: { min: 1, max: 20, step: 1 },
};

const WEAPON_RANGES: Ranges = {
  pellets: { min: 1, max: 24, step: 1 },
  spread: { min: 0, max: 0.6, step: 0.005 },
  fireInterval: { min: 0.02, max: 1.5, step: 0.005 },
  magazine: { min: 1, max: 300, step: 1 },
  reloadSeconds: { min: 0.1, max: 6, step: 0.05 },
  damage: { min: 0.5, max: 30, step: 0.5 },
  knockback: { min: 0, max: 1500, step: 10 },
  recoil: { min: 0, max: 1000, step: 10 },
  range: { min: 100, max: 3000, step: 10 },
  shake: { min: 0, max: 1, step: 0.01 },
  tracerWidth: { min: 1, max: 16, step: 0.5 },
  noiseRadius: { min: 0, max: 1500, step: 10 },
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
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`  ${key}: {`);
      for (const [field, v] of Object.entries(value))
        lines.push(`    ${field}: ${literal(v, field)},`);
      lines.push("  },");
    } else lines.push(`  ${key}: ${literal(value, key)},`);
  }
  lines.push(
    typeName
      ? `} as const satisfies Record<string, ${typeName}>;`
      : "} as const;",
  );
  return lines.join("\n") + "\n";
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
  panel.add("PLAYER", null, PLAYER, LOOT_RANGES);
  panel.add("DROPS", "DropDef", DROPS, LOOT_RANGES);
  panel.add("DROP_RULES", null, DROP_RULES, LOOT_RANGES);
  panel.add("ZOMBIE_AI", null, ZOMBIE_AI, ZOMBIE_AI_RANGES);
  panel.add("CASINGS", "CasingDef", CASINGS, CASING_RANGES);
  return panel;
}

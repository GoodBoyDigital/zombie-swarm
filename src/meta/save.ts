/**
 * What carries over between runs, in localStorage: banked coins, the furthest level unlocked, and
 * the longest each level has been survived. Bump `version` and migrate in `load` when the shape changes.
 */
export interface Save {
  version: 1;
  coins: number;
  /** Index into LEVELS of the furthest level the player may start. */
  unlockedLevel: number;
  /** Longest run per level index, seconds. */
  bestSeconds: Record<number, number>;
}

const KEY = "zombie-swarm-save";

const fresh = (): Save => ({
  version: 1,
  coins: 0,
  unlockedLevel: 0,
  bestSeconds: {},
});

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Partial<Save>) : null;
    if (data?.version !== 1) return fresh();
    return { ...fresh(), ...data };
  } catch {
    return fresh();
  }
}

export function writeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Private mode or a full quota: progress just doesn't persist.
  }
}

export interface RunOutcome {
  level: number;
  extracted: boolean;
  seconds: number;
  coins: number;
}

/** Bank a finished run's coins, record its time, and unlock the next level on extraction. */
export function recordRun(run: RunOutcome, levelCount: number): Save {
  const save = loadSave();
  save.coins += run.coins;
  save.bestSeconds[run.level] = Math.max(
    save.bestSeconds[run.level] ?? 0,
    run.seconds,
  );
  if (run.extracted)
    save.unlockedLevel = Math.max(
      save.unlockedLevel,
      Math.min(levelCount - 1, run.level + 1),
    );
  writeSave(save);
  return save;
}

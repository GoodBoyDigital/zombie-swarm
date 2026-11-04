/**
 * Dev-only hot reload for config tables. A config module self-accepts its own updates and hands
 * the fresh module to `applyHotConfig`, which copies the new values into the objects the game is
 * already holding, so the next frame uses them with no page reload. The game reads config live
 * (weapons per shot, zombies per frame), which is what makes this work.
 *
 * Only values change in place. If a table's shape changed (an entry added or removed, an array
 * resized, a number became an object), the module is invalidated and Vite falls back to a reload.
 *
 * Usage, at the bottom of a config file (Vite needs the literal `import.meta.hot.accept` there):
 *   if (import.meta.hot) {
 *     trackHotConfig(import.meta.hot, { WEAPONS });
 *     import.meta.hot.accept((next) => applyHotConfig(import.meta.hot, next));
 *   }
 *
 * Every update re-runs the module, making fresh objects, and the accept callback runs in that new
 * copy. So the objects the game actually holds are remembered on `hot.data` the first time the
 * module loads, and updates are copied into those.
 */

/** Fired on window after a config table was patched in place, e.g. so the tuning panel refreshes. */
export const CONFIG_UPDATED = "config-hot-update";

type Hot = ImportMeta["hot"];
type Slots = Record<string | number, unknown>;

const isObject = (v: unknown): v is Slots =>
  typeof v === "object" && v !== null;

/** Copy `next` into `live` field by field. False if the shape differs, so the caller reloads. */
function patch(live: unknown, next: unknown): boolean {
  if (!isObject(live) || !isObject(next)) return false;
  if (Array.isArray(live) !== Array.isArray(next)) return false;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(live).length) return false;
  for (const key of keys) {
    if (!(key in live)) return false;
    const cur = live[key];
    const val = next[key];
    if (isObject(cur)) {
      if (!patch(cur, val)) return false;
    } else if (typeof cur !== typeof val) {
      return false;
    } else {
      live[key] = val;
    }
  }
  return true;
}

/** Remember the tables the game imported, once, so later updates patch those exact objects. */
export function trackHotConfig(
  hot: Hot,
  tables: Record<string, unknown>,
): void {
  if (hot) hot.data.tables ??= tables;
}

export function applyHotConfig(
  hot: Hot,
  next: Record<string, unknown> | undefined,
): void {
  if (!hot) return;
  const live = hot.data.tables as Record<string, unknown> | undefined;
  if (!next || !live) return hot.invalidate();
  for (const name of Object.keys(live)) {
    if (!patch(live[name], next[name])) {
      hot.invalidate(`${name} changed shape; reloading`);
      return;
    }
  }
  console.info(`[config] hot-updated ${Object.keys(live).join(", ")}`);
  window.dispatchEvent(new Event(CONFIG_UPDATED));
}

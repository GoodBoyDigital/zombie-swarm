export const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);
export const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

/** Weighted choice. Totals are summed per call so weights can be tuned live. */
export function pickWeighted<T extends { weight: number }>(
  items: readonly T[],
): T {
  let total = 0;
  for (const item of items) total += item.weight;
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

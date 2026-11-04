import { readFile, writeFile } from "node:fs/promises";
import { summarizeTrace } from "./trace.mjs";

const label = process.argv[2] ?? "baseline";
const data = JSON.parse(await readFile(`perf/results/${label}.json`, "utf8"));
if (data.trace) {
  const events = JSON.parse(
    await readFile(data.trace.path, "utf8"),
  ).traceEvents;
  const profile = JSON.parse(await readFile(data.trace.cpuPath, "utf8"));
  Object.assign(data.trace, summarizeTrace(events, profile));
  await writeFile(`perf/results/${label}.json`, JSON.stringify(data, null, 2));
}
const format = (value) => (value == null ? "unavailable" : value.toFixed(2));
const tuple = (s) =>
  s
    ? ["mean", "p95", "p99", "max"].map((k) => format(s[k])).join(" / ")
    : "unavailable";
const lines = [
  "# Stress results",
  "",
  "Milliseconds, ordered mean / p95 / p99 / max.",
  "",
  "| Cap / segment | Frames | rAF | CPU step | CPU render | GPU elapsed | Draws mean / max |",
  "| --- | ---: | --- | --- | --- | --- | --- |",
];
for (const [variant, run] of Object.entries(data.variants)) {
  if (variant === "trace") continue;
  for (const [segment, r] of Object.entries(run.summary)) {
    const m = r.metrics;
    lines.push(
      `| ${variant} / ${segment} | ${m.step.n} | ${tuple(m.raf)} | ${tuple(m.step)} | ${tuple(m.render)} | ${tuple(r.gpu)} | ${format(m.draws.mean)} / ${m.draws.max} |`,
    );
  }
}
lines.push(
  "",
  "## System CPU milliseconds",
  "",
  "| Cap / segment | Horde | Weapon | Loot | Floor, overlapping | Player plus power-ups | FX | Misc |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
);
for (const [variant, run] of Object.entries(data.variants)) {
  if (variant === "trace") continue;
  for (const [segment, r] of Object.entries(run.summary)) {
    lines.push(
      `| ${variant} / ${segment} | ${["horde", "weapon", "loot", "floor", "player", "fx", "misc"].map((k) => tuple(r.metrics[k])).join(" | ")} |`,
    );
  }
}
if (data.trace) {
  lines.push(
    "",
    "## Separate diagnostic trace",
    "",
    `Trace duration ${format(data.trace.durationMs)} ms.`,
    "",
    "| Self ms | Function and generated source location |",
    "| ---: | --- |",
  );
  for (const [name, ms] of data.trace.topSelfMs)
    lines.push(`| ${format(ms)} | ${name.replaceAll("|", "\\|")} |`);
  lines.push(
    "",
    `GC: ${tuple(data.trace.gc)} ms.`,
    `Long tasks over 50 ms: ${tuple(data.trace.longTasks)} ms.`,
    `GPU thread tasks: ${tuple(data.trace.gpuTasks)} ms.`,
    `Trace DrawFrame intervals: ${tuple(data.trace.traceDrawFrameIntervals)} ms.`,
    `Trace AnimationFrame::Render durations: ${tuple(data.trace.traceAnimationFrameRender)} ms.`,
    `Profiler-setup long tasks: ${tuple(data.trace.profilerSetupTasks)} ms.`,
    `Other renderer-main long tasks: ${tuple(data.trace.gameLongTasks)} ms.`,
  );
}
lines.push("", `Runtime errors: ${data.errors.length}.`, "");
await writeFile(`perf/results/${label}-tables.md`, lines.join("\n"));
console.log(lines.join("\n"));

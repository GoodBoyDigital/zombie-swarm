import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { collectDiagnostics } from "./diagnose.mjs";
import { summarizeTrace } from "./trace.mjs";

// Full run by default. PERF_QUICK=1 is fixture validation, not a benchmark result.
const quick = process.env.PERF_QUICK === "1";
const url = process.env.PERF_URL ?? "http://localhost:8090/";
const label = process.env.PERF_LABEL ?? (quick ? "fixture" : "baseline");
const stamp = `${new Date().toISOString().replaceAll(":", "-")}-${label}`;
await mkdir("perf/traces", { recursive: true });
await mkdir("perf/results", { recursive: true });
// chromium.launch creates its own fresh temporary profile; use that supported
// launch API rather than adding --user-data-dir, which Playwright forbids there.
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--window-size=1456,999"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const results = {
  url,
  stamp,
  quick,
  profilePolicy: "Playwright-managed fresh temporary profile, deleted on close",
  browser: browser.version(),
  variants: {},
  errors,
};
const save = async () =>
  writeFile(`perf/results/${label}.json`, JSON.stringify(results, null, 2));
const install = async (cap) => {
  await page.goto(url);
  await page.waitForSelector("canvas");
  const environment = await page.evaluate(async (cap) => {
    const { installStress } = await import("/perf/runtime.js");
    return installStress({ cap });
  }, cap);
  await page.evaluate(
    (cap) =>
      new Promise((resolve) => {
        const check = () =>
          window.__stress.snapshot().alive >= cap * 0.98
            ? resolve()
            : requestAnimationFrame(check);
        check();
      }),
    cap,
  );
  await page.waitForTimeout(quick ? 1000 : 10000);
  return environment;
};
const segment = async (name, ms, options = {}) => {
  const state = await page.evaluate(
    ({ name, ms, options }) => window.__stress.segment(name, ms, options),
    { name, ms, options },
  );
  console.log(JSON.stringify({ segment: name, ...state }));
  return state;
};
const collect = async (key) => {
  const data = await page.evaluate(() => ({
    summary: window.__stress.summary(),
    environment: window.__stress.environment,
    marks: window.__stress.marks,
    heapDrops: window.__stress.heapDrops,
    final: window.__stress.snapshot(),
  }));
  results.variants[key] = data;
  const samples = await page.evaluate(() => ({
    rows: window.__stress.rows,
    gpu: window.__stress.gpu,
  }));
  // Population and CPU metrics must never share names. Catch a broken collector
  // before accepting its data, rather than reporting item counts as milliseconds.
  for (const sample of samples.rows) {
    if (
      !Number.isFinite(sample.lootCount) ||
      !Number.isFinite(sample.fxCount) ||
      !Number.isFinite(sample.loot) ||
      !Number.isFinite(sample.fx) ||
      sample.loot > sample.step + 0.2 ||
      sample.fx > sample.step + 0.2
    ) {
      throw new Error(
        `Invalid profiler sample in ${key}, frame ${sample.frame}`,
      );
    }
  }
  await writeFile(
    `perf/results/${label}-${key}-samples.json`,
    JSON.stringify(samples),
  );
  await save();
  return data;
};
try {
  for (const cap of [600, 1000]) {
    const environment = await install(cap);
    console.log(JSON.stringify({ environment }));
    await segment("minigun", quick ? 1500 : 15000);
    await segment("shotgun", quick ? 1500 : 15000, { gun: "shotgun" });
    for (const [powerup, ms] of [
      ["nuke", 5000],
      ["airstrike", 7000],
      ["shield", 8000],
      ["portal", 12000],
      ["powerMode", 10000],
    ]) {
      await segment(powerup, quick ? 1200 : ms, { powerup });
    }
    await collect(String(cap));
    // Capture only outside measurements; raw frame windows are already complete.
    await page.screenshot({ path: `perf/results/${label}-${cap}.png` });
    await page.evaluate(() => window.__stress.stop());
  }
  if (!quick) {
    await install(1000);
    const cdp = await context.newCDPSession(page);
    const traceEvents = [];
    cdp.on("Tracing.dataCollected", (event) =>
      traceEvents.push(...event.value),
    );
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
    await cdp.send("Tracing.start", {
      categories:
        "toplevel,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,v8,v8.execute,disabled-by-default-v8.cpu_profiler,blink.user_timing,gpu",
      options: "record-as-much-as-possible",
    });
    await cdp.send("Profiler.start");
    await segment("trace-nuke", 4000, { powerup: "nuke" });
    await segment("trace-domes", 4000, { powerup: "shield" });
    await segment("trace-portal-power", 4000, { powerup: "portal" });
    const { profile } = await cdp.send("Profiler.stop");
    const traceComplete = new Promise((resolve) =>
      cdp.once("Tracing.tracingComplete", resolve),
    );
    await cdp.send("Tracing.end");
    await traceComplete;
    await writeFile(
      `perf/traces/${stamp}.json`,
      JSON.stringify({ traceEvents }),
    );
    await writeFile(`perf/traces/${stamp}.cpuprofile`, JSON.stringify(profile));
    results.trace = {
      path: `perf/traces/${stamp}.json`,
      cpuPath: `perf/traces/${stamp}.cpuprofile`,
      ...summarizeTrace(traceEvents, profile),
    };
    await collect("trace");
    await cdp.detach();
    results.diagnostics = await collectDiagnostics(page);
    await save();
    await page.evaluate(() => window.__stress.stop());
    await install(600);
    await page.evaluate(() => window.__stress.startLong());
    // Six bounded calls keep the game advancing for five full wall-clock minutes.
    for (let chunk = 0; chunk < 6; chunk++) {
      await segment("long", 50000);
      await collect("long");
    }
    await page.screenshot({ path: `perf/results/${label}-long.png` });
    await page.evaluate(() => window.__stress.stop());
  }
  await save();
  console.log(`Saved perf/results/${label}.json`);
} finally {
  await browser.close();
}

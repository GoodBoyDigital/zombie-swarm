# Busy-arena benchmark

Run the development server in one terminal, then the benchmark in another:

```sh
npm install
VITE_BUILD_LABEL="perf" npx vite --port 8090 --strictPort
node perf/stress.mjs
node perf/analyze.mjs
```

Requires installed Google Chrome. The runner uses `playwright-core` with
`channel: "chrome"`, headed, a fresh Playwright-managed temporary profile, and
`--window-size=1456,999`. It never attaches to an existing browser or Playbot tab.
The temporary profile is removed when Chrome closes. Viewport 1280×720 CSS
pixels, DPR 2, antialiasing unchanged. Do not interact with Chrome during a run.

Allow about nine minutes. `PERF_QUICK=1 node perf/stress.mjs` validates the fixture
only. `PERF_LABEL=candidate` saves separate results. `PERF_URL` overrides
`http://localhost:8090/`. Read [REPORT.md](REPORT.md) for the retained findings.

## Workload

- Fresh game per variant, random seed 14731, 600 spawns/second, cap 600 then
  1000. Wait for 98% of the cap and ten further seconds before recording.
- Minigun for fifteen seconds, shotgun for fifteen. Hold fire, sweep aim, and
  move in a repeated WASD loop. Magazine size, cadence, reload, damage and
  visuals keep their shipped values.
- Mini nuke for five seconds, airstrike for seven, shield for eight, safety
  portal for twelve, power mode for ten. Effects use `Powerups.apply` inside
  the measured update, so synchronous explosion work is included.
- Health is immune and spare magazines unlimited in memory. Random orb drops
  are disabled only in the fixture to prevent unscripted modifier pickups.
  Top up the floor to about 2800 items once a second through `Loot.burst`.
  Natural kill loot keeps its 3000-item cap and twenty-second lifetime.
- A separate twelve-second 1000-zombie CDP trace triggers nuke, then shield,
  then portal. Domes overlap. Trace timings are not primary frame results.
- A separate six-second diagnostic uses both domes, power mode, and nuke.
  Method wrappers and individual GPU-pass queries add overhead and are not
  used for primary frame-time comparisons.
- A fresh 600-zombie run records five wall-clock minutes, alternating guns
  every fifteen seconds and triggering the five power-ups in order every
  eight seconds. Overlap is intentional. Summarize each minute separately.

The seed and inputs repeat, but real dt, audio loading and scheduling mean
kills are not bit-for-bit deterministic. Population read-backs and individual
samples establish the workload. Simulation dt clamps to 1/30 second, so wall
time and simulation time can differ. Six bounded fifty-second windows exclude
result serialization. The last minute bucket includes the small scheduling
overrun, not a claim of five equal-duration buckets.

## Measurements

The fixture intercepts `Profiler.smooth` to retain the unsmoothed measurements
behind the HUD. `step` is CPU update time; `render` is CPU submission after the
step. `floor` overlaps its caller and must not be added again. The `player`
lap includes power-up updates and starts. HUD refresh falls after `endFrame`
and is booked to `render` by the existing profiler. V stays off because it
adds geometry; per-system timings are captured directly instead.

Frame intervals use real rAF timestamps. The display's normal 120 Hz interval
is about 8.33 ms; CPU headroom is reported separately. `fixture` records input
and loot-refill CPU work outside the game step. Every sample checks distinct
names for CPU timings and population counts to catch invalid collectors.

GL calls include scene, filters and floor stamps. A second counter isolates
calls inside `FloorCanvas.stampTexture`. GPU timer queries sample one whole
frame every sixty frames, asynchronously, rejecting disjoint results. Sparse
queries can miss one-shot explosions. They measure GPU elapsed time, not pure
shader utilization. Never add GPU elapsed and CPU time as serial costs.

`performance.memory.usedJSHeapSize` is sampled when exposed. Drops over 1 MiB
are approximate GC evidence, not pause durations. Retained benchmark samples
and result serialization also affect heap usage, so this is not a leak test.

## Artifacts and trace interpretation

- `results/baseline.json`: environment, per-system mean/p95/p99/max, population
  read-backs, heap-drop evidence, trace summary and targeted diagnostics.
- `results/baseline-tables.md`: complete generated tables.
- Local `results/*-samples.json`: individual frames and GPU samples.
- Local PNGs: visual evidence captured only after recording stops. Their HUD
  FPS may include the subsequent result export; use the tables for FPS.
- Gitignored `traces/*.json`: drag into Chrome DevTools Performance.
- Gitignored `traces/*.cpuprofile`: the separate 1 ms sampled CPU profile.

No screenshots, traces, or bulk result serialization occur inside primary
windows. CDP uses timeline, frame, V8, user-timing, GPU and top-level categories.
CPU self-time sums sample deltas for leaf frames; it is not inclusive time.
Generated Vite line numbers can differ from authored TypeScript.

The analyzer counts outer RunTask events on this page's renderer-main thread,
not nested task wrappers or other Chrome threads. It flags profiler-startup
tasks separately. DrawFrame intervals and AnimationFrame::Render durations are
trace measurements, separate from untraced rAF and game CPU timings. GPUTask
durations describe Chrome GPU-service-thread work, not hardware shader time.

The `Document-Policy: js-profiling` header is dev-only and gated by
`VITE_BUILD_LABEL=perf`. Production builds emit no such header. The game never
imports the fixture. There are no gameplay or visual changes.

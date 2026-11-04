# Busy-arena profile, November 4, 2026

Preview: http://localhost:8090/ . Start and replay instructions are in
[README.md](README.md). Full mean/p95/p99/max tables for every segment and
system are in [results/baseline-tables.md](results/baseline-tables.md).
Machine-readable evidence is [results/baseline.json](results/baseline.json).

## Bottom line

Normal sustained fire has substantial CPU headroom on this machine, including
1000 zombies and roughly 2800 loot items. The important costs are mass-kill
bursts, dome GPU passes, and crowd separation. Accumulated floor gore did not
produce a rising average cost over five minutes. There are also rare large
rAF stalls that this capture does not fully attribute; do not hide them behind
the otherwise healthy averages.

This is a baseline and attribution change, not a gameplay optimization.
No gameplay or visuals were changed and no prototype before/after gain is claimed.

## Conditions

Apple M3 Max, macOS 27.2, headed Google Chrome 156.0.8078.80, WebGL 2 through
ANGLE Metal, installed PixiJS 8.22.0, TypeScript/Vite development build.
Source baseline `57540d1`, branch `zombie-swarm-performance-profile`.
Viewport 1280×720 CSS pixels, DPR 2, normal antialiasing. Display 120 Hz,
normal vsync interval 8.33 ms. No throttling or screenshots during primary
windows. Chrome used an isolated temporary profile; existing tabs were untouched.

Each fresh variant has ten seconds of warm-up after reaching its zombie cap.
Guns use their normal reloads and cadence, with unlimited spare magazines.
The player moves, aims in a sweep and holds fire. Loot is replenished through
the ordinary burst code; natural cap and expiry remain enabled. Scripted
power-ups run through the normal pickup handler. Health immunity and disabled
random orb drops are fixture settings, not changes to the shipped game.

The run records raw measurements behind the HUD rather than its 30-frame
smoothing. V stays off to avoid adding debug Graphics. `floor` overlaps other
systems; `player` includes power-up updates and activation. Frame intervals
are wall-clock rAF deltas, not `step + render`. GPU elapsed must not be added
to CPU time as if the two ran serially.

## Main results

All times below are milliseconds, ordered **mean / p95 / p99 / max**.
The full table includes both population variants and every system.

| 1000-zombie segment | rAF interval | CPU step | CPU render | GPU elapsed mean |
| --- | --- | --- | --- | ---: |
| Minigun, 15 s | 8.33 / 9.20 / 9.30 / 9.40 | 1.36 / 2.10 / 3.10 / 3.90 | 0.64 / 1.00 / 1.30 / 2.20 | 1.18 |
| Shotgun, 15 s | 8.54 / 9.30 / 9.40 / 149.50 | 1.43 / 1.90 / 2.30 / 7.00 | 0.58 / 1.00 / 1.30 / 16.40 | 1.58 |
| Mini nuke, 5 s | 8.42 / 9.30 / 9.40 / 41.70 | 1.75 / 3.30 / 4.90 / 38.60 | 0.88 / 2.30 / 5.20 / 6.80 | 1.02 |
| Airstrike, 7 s | 8.33 / 9.20 / 9.30 / 9.40 | 1.55 / 2.20 / 2.90 / 4.40 | 0.76 / 1.30 / 1.70 / 2.50 | 1.34 |
| Shield, 8 s | 8.33 / 9.20 / 9.30 / 9.40 | 1.47 / 2.00 / 2.20 / 3.40 | 0.83 / 1.20 / 1.50 / 5.70 | 3.17 |
| Safety portal, 12 s | 8.33 / 9.20 / 9.30 / 9.40 | 1.48 / 1.90 / 2.20 / 2.30 | 0.85 / 1.20 / 1.50 / 1.80 | 3.20 |
| Power mode, 10 s | 8.33 / 9.20 / 9.30 / 9.40 | 1.54 / 2.00 / 2.20 / 2.40 | 0.82 / 1.20 / 1.40 / 1.70 | 1.26 |

At the shipped cap of 600, minigun averaged 1.01 ms step and 0.48 ms render;
shotgun averaged 1.09 and 0.47 ms. Nuke peaked at 24.70 ms step and 4.90 ms
render. Shield/portal GPU elapsed averaged 3.29/3.47 ms, versus 1.11–1.42 ms
for ordinary shooting and airstrike. These figures show headroom, not a way
to exceed the display's 120 FPS cap.

## Ranked findings and proposed fixes

Expected gains here are engineering estimates bounded by measured costs,
not results from an implemented candidate. Preserve current order, damage,
cap, expiry, visuals and collision results in any follow-up.

### 1. Mass-kill bursts, especially loot-cap eviction

Path: `src/powerups/effects/nuke.ts` `start` → `src/combat/explosion.ts`
`explode` → `CombatContext.applyHit` → death/loot/effects.

The 1000-zombie nuke's peak frame had **38.60 ms step + 6.80 ms render**,
including 30.90 ms in the power-up/player lap, 5.10 ms in FX update,
9081 live FX and 1134 immediate floor-stamp draws. This is a real update
burst, not a screenshot artifact.

The sampled trace attributes 40.03 ms inclusively to `nuke.start`.
`src/entities/Loot.ts:211`, `Loot.oldest`, accounts for **18.07 ms self-time
inside that call**, about 45% of its sampled CPU. At the cap, every new item
scans the 3000-item live array to find an eviction victim.

Propose an indexed expiry min-heap with the existing live-index tie rule,
updated on swap-removes, instead of a full scan per overflow item. This keeps
the same cap, victim ordering and collection behavior. Target **10–18 ms less
CPU on a similar large nuke burst**. The sampled 18.07 ms is a ceiling for
this particular improvement, not the entire 38.60 ms step. Separately reuse
FX particle records and prewarm the observed burst capacity to reduce cold
allocation pressure without reducing particle counts.

### 2. Shield and portal displacement are the largest sustained GPU costs

`src/fx/DomeFilter.ts`, fragment shader and `prepare`; `ElectricDome` applies it.

Whole-frame GPU elapsed rises from about 1.2 ms to 3.2 ms with one dome.
The separate two-dome diagnostic samples **2.12 ms per filter application**,
p95 2.63 ms, max 3.01 ms. CPU submission for that method is tiny, 10.0 ms
total over 1439 applications. This is not a CPU Graphics rebuilding problem.
The implementation enables a back buffer and copies backdrop pixels, then
samples noise and multiple colour channels in the dome shader.

Propose an exact-output shader early-out where displacement weight is zero,
and inspect redundant backdrop copy/resolve transitions with GPU capture.
The current effect already uses dome-sized bounds, so simply adding smaller
filter bounds is not a new fix. A reasonable first target is **0.4–0.6 ms per
dome pass**, requiring measurement. Keep the ripple and colour split intact.

### 3. Each floor stamp starts its own renderer pass

`src/world/FloorCanvas.ts:53`, `stampTexture`.

The nuke frame issued **1152 draws, 1134 of them floor stamps**. Its floor
timing was 4.60 ms, already included in the caller's CPU time. In the separate
six-second diagnostic there were 2152 stamp calls and exactly 2152 stamp
draws, taking 46.4 ms inclusively. Ordinary floor cost is only 0.02–0.05 ms
per frame, so this is a burst issue, not a general frame-rate problem.

Propose pooling stamp sprites, queueing their immutable draw state in order,
then flushing once to the same RenderTexture before the scene renders.
Preserve every stamp and its blend order. Target **2–4 ms off the largest
burst**, with little average improvement. This does not fix the loot scan.

### 4. Crowd separation is the largest steady named JavaScript cost

`src/entities/Horde.ts:316`, `separate`, especially its query visitor;
`src/core/SpatialHash.ts:40`, `queryBox`; `Zombie.update` and sprite sync.

In the 12.15-second CPU profile, self-time is 421.69 ms in the separation
visitor, 193.86 ms in `queryBox`, 157.01 ms in `Zombie.update`, 152.60 ms in
`SpatialHash.insert` across both hashes, and 118.43 ms in `ZombieBrain.steer`.
The separate diagnostic measures `separate` at **0.37 ms/frame** within
`Horde.update` at 1.06 ms/frame. Primary horde averages rise from roughly
0.57–0.68 ms at 600 to 0.99–1.10 ms at 1000.

Propose caching each zombie's facing sine/cosine before the neighbour pass,
and reducing visitor/coordinate overhead while preserving traversal order.
Do not change to a once-per-pair solver without checking collision equivalence.
Target **0.1–0.2 ms CPU/frame** initially. This buys headroom, not higher
visible FPS on the current display.

### 5. Loot is not a draw-call explosion

`src/entities/Loot.ts:124`, `update`; Pixi `ParticleContainerPipe.execute`.

Even at 3000 allocated particles, loot uses **one draw per frame**. The
diagnostic measured 0.094 ms CPU submission and 0.81 ms sampled GPU elapsed
for that draw. Primary loot update is usually 0.23–0.32 ms CPU. Dynamic
position, vertex and colour data are refreshed for the particle allocation.

Only after the burst and dome work, consider avoiding unchanged attribute
work for settled items while preserving bounce, blink and pickup behavior.
An initial gain above **0.1–0.2 ms CPU/frame** would be surprising without
a larger change; GPU gain remains unquantified. Do not replace the existing
ParticleContainer with thousands of ordinary sprites.

### Graphics and ordinary FX are lower priorities

In 720 diagnostic frames, `Reticle.drawRing` totals 1.5 ms, both domes'
`drawArcs` total 4.3 ms, and all Graphics context updates total 55.3 ms,
about 0.077 ms/frame. The power aura is built once and transformed afterward.
Explosions use pooled sprites, not rebuilt Graphics. Effects update can be
expensive during the 9000-particle nuke burst, but routine ring/aura drawing
is not where I would spend the first optimization pass.

## Five-minute accumulation

Six fifty-second primary windows recorded 35,893 frames. Final read-back:
600 alive, 5380 kills, 53,639 floor stamps, 3000 allocated loot particles,
2784 live loot, floor target still 1600×1040 world pixels at resolution 2.

| Minute bucket | CPU step mean | CPU render mean | Floor mean | rAF p99 | rAF max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.12 | 0.69 | 0.034 | 9.30 | 24.20 |
| 2 | 1.11 | 0.68 | 0.031 | 9.30 | 25.10 |
| 3 | 1.21 | 0.69 | 0.036 | 9.40 | 208.90 |
| 4 | 1.11 | 0.67 | 0.025 | 9.30 | 216.90 |
| 5, including overrun | 1.09 | 0.68 | 0.029 | 9.30 | 32.50 |

No rising average floor/render cost is evident. Old corpses and scorches are
pixels in the persistent texture, not a growing display list. The changing
late-game zombie mix and overlapping power-ups prevent treating this as a
controlled floor-only comparison. Sparse whole-frame GPU elapsed samples
also had tails, up to 26.91 ms in minute four, not explained by average CPU.

## Trace, GC and limits

Retained raw files, intentionally gitignored:

- `perf/traces/2026-11-04T20-35-59.531Z-baseline.json`, about 77 MB.
- `perf/traces/2026-11-04T20-35-59.531Z-baseline.cpuprofile`.

There are **19 MinorGC events**, mean 0.68 ms, p95/p99/max 1.82 ms,
total 12.914 ms. No MajorGC appears in this twelve-second diagnostic.
This does not rule out major GC during the untraced five-minute run.

Three renderer-main tasks exceed 50 ms. Two are profiler-startup artifacts,
92.62 and 121.17 ms, containing `CpuProfiler::StartProfiling` work. The
remaining nuke-era task is 61.59 ms, including a 60.23 ms rAF callback and
1.82 ms minor GC. Do not compare these traced tails against primary results.
Trace DrawFrame intervals are 8.53 / 9.21 / 9.48 / 124.27 ms, and
AnimationFrame::Render durations are 3.39 / 4.07 / 9.11 / 92.25 ms.
The 3489 Chrome GPUTask events total 899.67 ms, p95 0.506 ms, max 8.671 ms.
These are GPU-service-thread durations, not hardware shader execution time.

CPU sampling includes 5054.40 ms in idle and 4222.46 ms in the unattributed
program bucket. Those are not named JavaScript function costs. Leaf self-time
does not explain all native rendering, driver, browser and scheduling work.

Primary shotgun windows contain 182.20/149.50 ms rAF stalls, and the long run
contains 208.90/216.90 ms stalls. The corresponding CPU step/render samples
are much shorter, so assigning all of these to `Horde.separate` would be
wrong. A 12.43 MB sampled heap drop coincides with the 600-shotgun stall;
a 26.22 MB drop coincides with a separate 37.30 ms 1000-shotgun interval.
These are GC correlations, not measured pause durations or complete causes.
The other large stalls remain unattributed by the short trace. Heap samples
are approximate and include benchmark retention/export allocations. This
report establishes neither a game memory leak nor its absence.

Runtime errors recorded by Chrome: **0**. Visual evidence is retained locally
after measurement, including `perf/results/baseline-long.png`. Build, lint,
TypeScript and script syntax checks passed. Existing build warnings concern
the missing style.css reference and large output chunks.

Retained result: **unchanged gameplay**, with a repeatable benchmark and a
measured baseline. No optimization candidate was retained or claimed. The
first follow-up should address the measured nuke eviction scan, then GPU
dome cost; rare unattributed stalls need a longer timeline capture rather
than a speculative gameplay rewrite.

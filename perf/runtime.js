// Imported only by the owned Playwright profiling tab, never by the game.
import { Game } from "/src/Game.ts";
import { profiler } from "/src/debug/Profiler.ts";
import { SPAWN } from "/src/config/zombies.ts";
import { POWERUPS } from "/src/config/powerups.ts";
import { DROP_RULES } from "/src/config/drops.ts";
import { aiDebug } from "/src/entities/ZombieBrain.ts";

export async function installStress({ cap = 600, seed = 14731 } = {}) {
  const initialSeed = seed;
  let game;
  const originalStep = Game.prototype.step;
  Game.prototype.step = function (dt) {
    game = this;
    return originalStep.call(this, dt);
  };
  await new Promise((resolve, reject) => {
    const deadline = performance.now() + 15000;
    const wait = () =>
      game
        ? resolve()
        : performance.now() > deadline
          ? reject(new Error("Game startup timed out"))
          : requestAnimationFrame(wait);
    requestAnimationFrame(wait);
  });
  if (!game) throw new Error("Game ticker did not advance");
  const originalRandom = Math.random;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const originalSpawn = { ...SPAWN, curve: SPAWN.curve.map((p) => ({ ...p })) };
  const originalDrops = { ...DROP_RULES };
  Object.assign(SPAWN, {
    maxAlive: cap,
    curve: [
      { at: 0, rate: 600 },
      { at: 1, rate: 600 },
    ],
    inboundRate: 600,
    landedRate: 600,
  });
  Object.assign(DROP_RULES, {
    weaponChanceArmed: 0,
    weaponChanceOnBackup: 0,
    powerupChancePerKill: 0,
    timedSpawnSeconds: 0,
  });
  game.player.invuln = Infinity;
  game.equip("minigun");
  game.weapon.spareMagazines = Infinity;
  aiDebug.enabled = false; // V also draws extra geometry. Systems are captured directly.
  const gl = game.app.renderer.gl;
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const originals = [];
  const wrap = (object, key, factory) => {
    const original = object[key];
    object[key] = factory(original);
    originals.push(() => {
      object[key] = original;
    });
  };
  let row = {},
    draws = 0,
    floorDraws = 0,
    floorDepth = 0,
    stamps = 0;
  let activeQuery,
    queryFrame = 0,
    frameId = 0;
  const pendingQueries = [],
    gpu = [],
    rows = [],
    marks = [],
    heapDrops = [];
  let segment = "warmup",
    recording = false,
    started = performance.now();
  let previousRaf,
    lastHeap,
    runStart = started,
    scheduled = [];
  let chunkFinished,
    chunkEnd = 0,
    longMode = false,
    previousCycle = -1;
  let nextLoot = 0,
    weapon = "minigun";
  const snapshot = () => ({
    alive: game.horde.alive.length,
    entered: game.horde.alive.filter((z) => z.entered).length,
    kills: game.horde.kills,
    loot: game.loot.count,
    particles: game.loot.view.particleChildren.length,
    fx: game.fx.live.length,
    corpses: game.horde.corpses.view.children.length,
    elapsed: game.elapsed,
    health: game.player.health,
    weapon: game.weapon.id,
    active: game.powerups.active.map((a) => a.def.id).join(","),
    stamps: totalStamps,
    floorSize: [game.floor.target.width, game.floor.target.height],
  });
  let totalStamps = 0;
  const fillLoot = () => {
    // Ordinary burst/spawn code, including the shipped oldest-first cap.
    while (game.loot.count < 2800) {
      const a = Math.random() * Math.PI * 2;
      game.loot.burst(
        640 + Math.cos(a) * (150 + Math.random() * 360),
        360 + Math.sin(a) * (130 + Math.random() * 150),
        0,
        0,
      );
    }
  };
  fillLoot();
  for (const key of [
    "drawElements",
    "drawArrays",
    "drawElementsInstanced",
    "drawArraysInstanced",
  ]) {
    if (!gl[key]) continue;
    wrap(
      gl,
      key,
      (original) =>
        function (...args) {
          draws++;
          if (floorDepth) floorDraws++;
          return original.apply(this, args);
        },
    );
  }
  wrap(
    game.floor,
    "stampTexture",
    (original) =>
      function (...args) {
        stamps++;
        totalStamps++;
        floorDepth++;
        try {
          return original.apply(this, args);
        } finally {
          floorDepth--;
        }
      },
  );
  wrap(
    profiler,
    "smooth",
    (original) =>
      function (name, ms) {
        row[name] = ms;
        return original.call(this, name, ms);
      },
  );
  const beginSegment = (name, durationMs, powerup) => {
    segment = name;
    recording = true;
    previousRaf = undefined;
    if (powerup) scheduled.push(powerup);
    marks.push({ name, at: performance.now(), ...snapshot() });
    chunkEnd = performance.now() + durationMs;
  };
  const originalUpdate = game.powerups.update;
  wrap(
    game.powerups,
    "update",
    () =>
      function (dt) {
        for (const id of scheduled) game.powerups.apply(POWERUPS[id]);
        scheduled = [];
        return originalUpdate.call(this, dt);
      },
  );
  const cycle = ["nuke", "airstrike", "shield", "portal", "powerMode"];
  const drive = (now) => {
    game.input.firing = true;
    game.weapon.spareMagazines = Infinity;
    // Normal movement, orbiting through WASD. Sweeping aim through the crowd.
    const t = (now - runStart) / 1000;
    game.input.held.clear();
    const phase = Math.floor(t / 1.5) % 4;
    game.input.held.add(["KeyD", "KeyS", "KeyA", "KeyW"][phase]);
    game.input.pointer.x = 640 + Math.cos(t * 0.8) * 430;
    game.input.pointer.y = 360 + Math.sin(t * 0.8) * 240;
    if (game.weapon.id !== weapon) game.equip(weapon);
    if (now >= nextLoot) {
      fillLoot();
      nextLoot = now + 1000;
    }
    if (longMode) {
      const c = Math.floor(t / 8);
      if (c !== previousCycle) {
        scheduled.push(cycle[c % cycle.length]);
        previousCycle = c;
      }
      weapon = Math.floor(t / 15) % 2 ? "shotgun" : "minigun";
      segment = `long-${Math.min(4, Math.floor(t / 60)) + 1}`;
    }
  };
  Game.prototype.step = function (dt) {
    game = this;
    const now = performance.now();
    const fixtureStart = performance.now();
    drive(now);
    row = { fixture: performance.now() - fixtureStart };
    draws = floorDraws = stamps = 0;
    frameId++;
    if (ext && frameId % 60 === 0 && !activeQuery) {
      activeQuery = gl.createQuery();
      queryFrame = frameId;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, activeQuery);
    }
    return originalStep.call(this, dt);
  };
  wrap(
    profiler,
    "endRender",
    (original) =>
      function () {
        original.call(this);
        if (activeQuery) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pendingQueries.push({
            query: activeQuery,
            frame: queryFrame,
            segment,
          });
          activeQuery = undefined;
        }
        if (
          pendingQueries.length &&
          gl.getQueryParameter(
            pendingQueries[0].query,
            gl.QUERY_RESULT_AVAILABLE,
          )
        ) {
          const q = pendingQueries.shift();
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            gpu.push({
              frame: q.frame,
              segment: q.segment,
              ms: gl.getQueryParameter(q.query, gl.QUERY_RESULT) / 1e6,
            });
          }
          gl.deleteQuery(q.query);
        }
        if (recording)
          rows.push({
            segment,
            frame: frameId,
            at: performance.now(),
            ...row,
            draws,
            floorDraws,
            stamps,
            alive: game.horde.alive.length,
            lootCount: game.loot.count,
            fxCount: game.fx.live.length,
            heap: performance.memory?.usedJSHeapSize,
          });
      },
  );
  let rafHandle;
  const raf = (now) => {
    const delta = previousRaf === undefined ? undefined : now - previousRaf;
    previousRaf = now;
    const last = rows[rows.length - 1];
    if (last && last.frame === frameId) last.raf = delta;
    const heap = performance.memory?.usedJSHeapSize;
    if (heap && lastHeap && heap < lastHeap - 1024 * 1024) {
      heapDrops.push({
        at: now,
        segment,
        bytes: lastHeap - heap,
        raf: delta,
        step: row.step,
        render: row.render,
      });
    }
    lastHeap = heap;
    if (chunkFinished && performance.now() >= chunkEnd) {
      recording = false;
      const resolve = chunkFinished;
      chunkFinished = undefined;
      resolve(snapshot());
    }
    rafHandle = requestAnimationFrame(raf);
  };
  rafHandle = requestAnimationFrame(raf);
  window.__stress = {
    rows,
    gpu,
    marks,
    heapDrops,
    snapshot,
    environment: {
      cap,
      seed: initialSeed,
      started,
      size: [innerWidth, innerHeight, devicePixelRatio],
      agent: navigator.userAgent,
      gpu: gl.getParameter(
        gl.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL,
      ),
      gpuTimer: !!ext,
      selfProfiling: typeof globalThis.Profiler,
      visibility: document.visibilityState,
    },
    segment(name, durationMs, { gun = "minigun", powerup } = {}) {
      weapon = gun;
      beginSegment(name, durationMs, powerup);
      return new Promise((resolve) => {
        chunkFinished = resolve;
      });
    },
    startLong() {
      longMode = true;
      runStart = performance.now();
      previousCycle = -1;
    },
    summary() {
      const stats = (values) => {
        const a = values.filter(Number.isFinite).sort((a, b) => a - b);
        return a.length
          ? {
              n: a.length,
              mean: a.reduce((s, x) => s + x, 0) / a.length,
              p95: a[Math.ceil(a.length * 0.95) - 1],
              p99: a[Math.ceil(a.length * 0.99) - 1],
              max: a[a.length - 1],
            }
          : null;
      };
      return Object.fromEntries(
        [...new Set(rows.map((r) => r.segment))].map((name) => {
          const r = rows.filter((r) => r.segment === name);
          const keys = [...new Set(r.flatMap((x) => Object.keys(x)))].filter(
            (k) => !["segment", "frame", "at"].includes(k),
          );
          return [
            name,
            {
              duration: (r.at(-1).at - r[0].at) / 1000,
              metrics: Object.fromEntries(
                keys.map((k) => [k, stats(r.map((x) => x[k]))]),
              ),
              gpu: stats(
                gpu.filter((x) => x.segment === name).map((x) => x.ms),
              ),
            },
          ];
        }),
      );
    },
    stop() {
      recording = false;
      game.input.firing = false;
      game.input.held.clear();
      cancelAnimationFrame(rafHandle);
      originals.reverse().forEach((restore) => restore());
      Game.prototype.step = originalStep;
      Math.random = originalRandom;
      Object.assign(SPAWN, originalSpawn);
      Object.assign(DROP_RULES, originalDrops);
      game.player.invuln = 0;
      for (const q of pendingQueries) gl.deleteQuery(q.query);
    },
  };
  return window.__stress.environment;
}

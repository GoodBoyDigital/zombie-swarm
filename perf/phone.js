// Dev server only, never imported by the game: a busy arena that plays itself and prints its frame
// times on screen, for reading off a real phone by screenshot (see perf/README.md, "On a phone").
//
//   import("/perf/phone.js").then((m) => m.run({ cap: 600, seconds: 40 }))

// Vite adds ?t= to modules edited since it started, so ask for the copies the page already runs.
const live = (path) =>
  performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .find((name) => name.includes(path)) ?? path;

export async function run({ cap = 600, seconds = 40, warmup = 12 } = {}) {
  const [{ Game }, { SPAWN }, { DROP_RULES }] = await Promise.all([
    import(/* @vite-ignore */ live("/src/Game.ts")),
    import(/* @vite-ignore */ live("/src/config/zombies.ts")),
    import(/* @vite-ignore */ live("/src/config/drops.ts")),
  ]);
  const game = await new Promise((resolve) => {
    const step = Game.prototype.step;
    Game.prototype.step = function (dt) {
      Game.prototype.step = step;
      resolve(this);
      return step.call(this, dt);
    };
  });
  Object.assign(SPAWN, {
    maxAlive: cap,
    curve: [
      { at: 0, rate: 600 },
      { at: 1, rate: 600 },
    ],
  });
  Object.assign(DROP_RULES, {
    weaponChanceArmed: 0,
    weaponChanceOnBackup: 0,
    powerupChancePerKill: 0,
  });
  game.player.invuln = Infinity;
  game.equip("minigun");
  game.weapon.spareMagazines = Infinity;
  // Hold the trigger, sweep the aim round and walk a slow circle, whatever the real device is doing.
  const started = performance.now();
  const turn = (rate) => {
    const a = ((performance.now() - started) / 1000) * rate;
    return { x: Math.cos(a), y: Math.sin(a) };
  };
  game.input.consumeFire = () => true;
  game.input.moveAxis = () => turn(0.5);
  Object.defineProperty(game.input, "aim", {
    get: () => ({ kind: "direction", ...turn(1.3) }),
  });

  const box = document.createElement("pre");
  Object.assign(box.style, {
    position: "fixed",
    right: "8px",
    bottom: "8px",
    margin: "0",
    padding: "6px 10px",
    font: "bold 13px monospace",
    color: "#fff",
    background: "rgba(0, 0, 0, 0.8)",
    zIndex: "20",
    pointerEvents: "none",
  });
  document.body.appendChild(box);
  const { canvas, renderer } = game.app;
  const setup =
    `${canvas.width}x${canvas.height}  res ${+renderer.resolution.toFixed(3)}  dpr ${devicePixelRatio}  ` +
    `aa ${renderer.gl?.getContextAttributes().antialias ? "on" : "off"}`;
  const frames = [];
  let last = performance.now();
  let shown = 0;
  const tick = (now) => {
    const t = (now - started) / 1000;
    if (t > warmup && t <= warmup + seconds) frames.push(now - last);
    last = now;
    if (now - shown > 500) {
      shown = now;
      const sorted = [...frames].sort((a, b) => a - b);
      const avg =
        frames.reduce((sum, ms) => sum + ms, 0) / (frames.length || 1);
      const at = (share) => sorted[Math.floor(sorted.length * share)] ?? 0;
      const over = frames.filter((ms) => ms > 20).length;
      box.textContent =
        `${setup}\n` +
        `zombies ${game.horde.alive.length}/${cap}   t ${t.toFixed(0)}s\n` +
        `frame avg ${avg.toFixed(2)} ms (${(1000 / (avg || 1)).toFixed(1)} fps)  p50 ${at(0.5).toFixed(1)}  p95 ${at(0.95).toFixed(1)}  max ${at(0.999).toFixed(0)}\n` +
        `frames ${frames.length}   over 20 ms: ${over} (${((100 * over) / (frames.length || 1)).toFixed(1)}%)\n` +
        (t > warmup + seconds
          ? "DONE"
          : t > warmup
            ? "measuring"
            : "warming up");
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

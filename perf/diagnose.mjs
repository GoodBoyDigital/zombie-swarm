// Short, separately labelled diagnostic capture. Never used for before/after FPS.
export async function collectDiagnostics(page) {
  await page.evaluate(async () => {
    const { Game } = await import("/src/Game.ts");
    let game;
    const step = Game.prototype.step;
    Game.prototype.step = function (dt) {
      game = this;
      return step.call(this, dt);
    };
    await new Promise((resolve) => requestAnimationFrame(resolve));
    Game.prototype.step = step;
    const { POWERUPS } = await import("/src/config/powerups.ts");
    game.powerups.apply(POWERUPS.shield);
    game.powerups.apply(POWERUPS.portal);
    game.powerups.apply(POWERUPS.powerMode);
    const renderer = game.app.renderer;
    const gl = renderer.gl;
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const methods = {},
      stack = [],
      restore = [],
      queries = [],
      gpu = {};
    let draws = 0;
    for (const key of [
      "drawElements",
      "drawArrays",
      "drawElementsInstanced",
      "drawArraysInstanced",
    ]) {
      const old = gl[key];
      gl[key] = function (...args) {
        draws++;
        return old.apply(this, args);
      };
      restore.push(() => {
        gl[key] = old;
      });
    }
    const poll = () => {
      while (
        queries.length &&
        gl.getQueryParameter(queries[0].q, gl.QUERY_RESULT_AVAILABLE)
      ) {
        const { q, name } = queries.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
          (gpu[name] ??= []).push(
            gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6,
          );
        gl.deleteQuery(q);
      }
    };
    const wrap = (object, key, name, sampleGpu = false) => {
      if (!object?.[key]) return;
      const old = object[key];
      const data = (methods[name] = {
        calls: 0,
        totalMs: 0,
        selfMs: 0,
        maxMs: 0,
        draws: 0,
      });
      object[key] = function (...args) {
        const drawStart = draws;
        let q;
        if (
          sampleGpu &&
          ext &&
          data.calls % 30 === 0 &&
          !gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
        ) {
          q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        }
        const entry = { child: 0 };
        stack.push(entry);
        const start = performance.now();
        try {
          return old.apply(this, args);
        } finally {
          const ms = performance.now() - start;
          stack.pop();
          if (stack.length) stack.at(-1).child += ms;
          data.calls++;
          data.totalMs += ms;
          data.selfMs += ms - entry.child;
          data.maxMs = Math.max(data.maxMs, ms);
          data.draws += draws - drawStart;
          if (q) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            queries.push({ q, name });
          }
          if (sampleGpu) poll();
        }
      };
      restore.push(() => {
        object[key] = old;
      });
    };
    for (const [object, key, name, gpuSample] of [
      [game.horde, "update", "Horde.update"],
      [game.horde, "separate", "Horde.separate"],
      [game.loot, "oldest", "Loot.oldest"],
      [game.loot, "spawn", "Loot.spawn"],
      [game.loot, "burst", "Loot.burst"],
      [game.loot, "update", "Loot.update"],
      [game.floor, "stampTexture", "FloorCanvas.stampTexture"],
      [renderer, "render", "Renderer.render"],
      [renderer.filter, "applyFilter", "FilterSystem.applyFilter", true],
      [
        renderer.renderPipes.particle,
        "execute",
        "ParticleContainerPipe.execute",
        true,
      ],
      [
        renderer.graphicsContext,
        "updateGpuContext",
        "GraphicsContextSystem.updateGpuContext",
      ],
      [game.reticle, "drawRing", "Reticle.drawRing"],
      [game.powerups, "update", "Powerups.update"],
      [game.horde.corpses, "update", "Corpses.update"],
      [game.casings, "update", "Casings.update"],
      [game.fx, "update", "Effects.update"],
    ])
      wrap(object, key, name, gpuSample);
    for (const active of game.powerups.active) {
      const dome = active.state?.dome;
      if (dome) {
        wrap(dome, "drawArcs", `ElectricDome.drawArcs.${active.def.id}`);
        wrap(dome, "drawBody", `ElectricDome.drawBody.${active.def.id}`);
      }
    }
    window.__diagnostics = {
      methods,
      gpu,
      poll,
      restore,
      start: performance.now(),
      startRows: window.__stress.rows.length,
    };
  });
  await page.evaluate(() =>
    window.__stress.segment("diagnostic", 6000, { powerup: "nuke" }),
  );
  return page.evaluate(() => {
    const d = window.__diagnostics;
    d.poll();
    d.restore.reverse().forEach((fn) => fn());
    const stats = (a) => {
      a.sort((a, b) => a - b);
      return {
        n: a.length,
        mean: a.reduce((s, x) => s + x, 0) / a.length,
        p95: a[Math.ceil(a.length * 0.95) - 1],
        p99: a[Math.ceil(a.length * 0.99) - 1],
        max: a.at(-1),
      };
    };
    return {
      durationMs: performance.now() - d.start,
      frames: window.__stress.rows.length - d.startRows,
      methods: d.methods,
      gpu: Object.fromEntries(
        Object.entries(d.gpu).map(([name, a]) => [name, stats(a)]),
      ),
      snapshot: window.__stress.snapshot(),
    };
  });
}

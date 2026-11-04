// Offline analysis is shared with the runner so retained traces can be reanalyzed.
export function summarizeTrace(events, profile) {
  const stats = (values) => {
    const a = values.filter(Number.isFinite).sort((a, b) => a - b);
    return a.length
      ? {
          n: a.length,
          total: a.reduce((s, x) => s + x, 0),
          mean: a.reduce((s, x) => s + x, 0) / a.length,
          p95: a[Math.ceil(a.length * 0.95) - 1],
          p99: a[Math.ceil(a.length * 0.99) - 1],
          max: a.at(-1),
        }
      : null;
  };
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const f = nodes.get(profile.samples[i]).callFrame;
    const key = `${f.functionName || "(anonymous)"} @ ${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  const frameThreads = {};
  for (const e of events.filter((e) => e.name === "FireAnimationFrame")) {
    const key = `${e.pid}:${e.tid}`;
    frameThreads[key] = (frameThreads[key] ?? 0) + 1;
  }
  const mainThread = Object.entries(frameThreads).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  const main = events.filter((e) => `${e.pid}:${e.tid}` === mainThread);
  // RunTask and ThreadControllerImpl::RunTask describe nested versions of the
  // same task. Select only outer RunTask events on this page's renderer thread.
  const tasks = main.filter(
    (e) => e.name === "RunTask" && e.ph === "X" && e.dur > 50000,
  );
  const classifiedTasks = tasks.map((task) => ({
    at: task.ts / 1000,
    ms: task.dur / 1000,
    threadMs: task.tdur / 1000,
    profilerSetup: main.some(
      (event) =>
        event.name === "CpuProfiler::StartProfiling" &&
        event.ph === "X" &&
        event.ts >= task.ts &&
        event.ts < task.ts + task.dur &&
        event.dur > 10000,
    ),
  }));
  const gcEvents = main
    .filter((e) => /^(MinorGC|MajorGC)$/.test(e.name) && e.ph === "X")
    .map((e) => ({ name: e.name, ms: e.dur / 1000, at: e.ts / 1000 }));
  const draws = events
    .filter(
      (e) => e.name === "DrawFrame" && `${e.pid}` === mainThread?.split(":")[0],
    )
    .sort((a, b) => a.ts - b.ts);
  const intervals = draws.slice(1).map((e, i) => (e.ts - draws[i].ts) / 1000);
  const renderStarts = new Map(),
    renderDurations = [];
  for (const e of main
    .filter((e) => e.name === "AnimationFrame::Render")
    .sort((a, b) => a.ts - b.ts)) {
    const key = JSON.stringify(e.id2 ?? e.id);
    if (e.ph === "b") renderStarts.set(key, e.ts);
    if (e.ph === "e" && renderStarts.has(key)) {
      renderDurations.push((e.ts - renderStarts.get(key)) / 1000);
      renderStarts.delete(key);
    }
  }
  const nukeNode = profile.nodes.find(
    (n) =>
      n.callFrame.url.includes("/effects/nuke.ts") &&
      n.callFrame.functionName === "start",
  );
  const parents = new Map(
    profile.nodes.flatMap((n) => (n.children ?? []).map((id) => [id, n.id])),
  );
  let nukeInclusiveMs = 0;
  const nukeSelf = new Map();
  for (let i = 0; nukeNode && i < profile.samples.length; i++) {
    let id = profile.samples[i];
    while (id && id !== nukeNode.id) id = parents.get(id);
    if (id !== nukeNode.id) continue;
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    nukeInclusiveMs += ms;
    const f = nodes.get(profile.samples[i]).callFrame;
    const key = `${f.functionName || "(anonymous)"} @ ${f.url}:${f.lineNumber + 1}`;
    nukeSelf.set(key, (nukeSelf.get(key) ?? 0) + ms);
  }
  return {
    durationMs: (profile.endTime - profile.startTime) / 1000,
    mainThread,
    sampledTotalMs: [...self.values()].reduce((s, x) => s + x, 0),
    topSelfMs: [...self].sort((a, b) => b[1] - a[1]).slice(0, 50),
    nukeInclusiveMs,
    nukeSelfMs: [...nukeSelf].sort((a, b) => b[1] - a[1]),
    gc: stats(gcEvents.map((e) => e.ms)),
    gcEvents,
    longTasks: stats(tasks.map((e) => e.dur / 1000)),
    longTaskEvents: classifiedTasks,
    gameLongTasks: stats(
      classifiedTasks.filter((t) => !t.profilerSetup).map((t) => t.ms),
    ),
    profilerSetupTasks: stats(
      classifiedTasks.filter((t) => t.profilerSetup).map((t) => t.ms),
    ),
    traceDrawFrameIntervals: stats(intervals),
    traceAnimationFrameRender: stats(renderDurations),
    gpuTasks: stats(
      events
        .filter((e) => e.name === "GPUTask" && e.ph === "X")
        .map((e) => e.dur / 1000),
    ),
    eventNames: [...new Set(events.map((e) => e.name))].filter((n) =>
      /Frame|GPU|GC|Task/.test(n),
    ),
  };
}

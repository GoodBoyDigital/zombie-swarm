import {
  Application,
  Container,
  GlProgram,
  Graphics,
  UPDATE_PRIORITY,
  type Filter,
  type WebGLRenderer,
} from "pixi.js";
import { ElectricDome } from "../fx/ElectricDome";

/**
 * Dome lab (dome-lab.html): the electric dome on its own over a reference grid, for chasing filter
 * cost and alignment on phones. Everything is a URL param:
 *
 *   dpr         renderer resolution (default: the device's)
 *   filterRes   the dome filter's resolution (default: whatever the dome sets)
 *   count       domes, laid out in a block round the centre
 *   zoom        scale of the container the domes sit in, like the game camera
 *   radius      dome radius, world px
 *   ripple      displacement, px
 *   filterArea  on | off: keep or drop the dome layer's fixed filterArea
 *   precision   mediump | highp: fragment shader default precision
 *   aa          on | off: renderer antialias (the game runs with it on)
 *   filter      on | off: off draws the dome with no filter at all, as a baseline
 *   x, y        shift the block, screen px, e.g. to hang a dome off the edge
 *
 * The magenta circle is where the rim should be and the yellow square is the dome's fixed
 * filterArea. With ripple=0 the grid must run straight through both.
 */
const query = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = Number(query.get(key));
  return query.get(key) !== null && Number.isFinite(v) ? v : fallback;
};
const on = (key: string) => query.get(key) !== "off";

const dpr = num("dpr", window.devicePixelRatio);
const filterRes = num("filterRes", 0);
const count = Math.max(0, Math.round(num("count", 1)));
const zoom = num("zoom", 1);
const radius = num("radius", 110);
const ripple = num("ripple", 7);
const precision = query.get("precision") === "highp" ? "highp" : "mediump";

/** Rim half-width as the dome draws it; the dome's filterArea is the rim's outer edge. */
const RIM_HALF = 1.5;
const GRID = 20;
const WINDOW = 90;

(async () => {
  GlProgram.defaultOptions.preferredFragmentPrecision = precision;
  const app = new Application();
  await app.init({
    background: "#141210",
    resizeTo: window,
    antialias: on("aa"),
    resolution: dpr,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  const world = new Container({ label: "labWorld" });
  const grid = new Graphics();
  const outlines = new Graphics();
  world.scale.set(zoom);
  app.stage.addChild(world);

  const cols = Math.ceil(Math.sqrt(count));
  const spacing = radius * 2 + 24;
  const domes = Array.from({ length: count }, (_, i) => {
    const dome = new ElectricDome();
    dome.x = ((i % cols) - (cols - 1) / 2) * spacing;
    dome.y =
      (Math.floor(i / cols) - (Math.ceil(count / cols) - 1) / 2) * spacing;
    dome.radius = radius;
    dome.ripple = ripple;
    return dome;
  });
  world.addChild(grid, ...domes.map((d) => d.view), outlines);
  for (const d of domes) {
    const extent = radius + RIM_HALF;
    outlines
      .circle(d.x, d.y, radius)
      .stroke({ width: 1 / zoom, color: 0xff2bd6 })
      .rect(d.x - extent, d.y - extent, extent * 2, extent * 2)
      .stroke({ width: 1 / zoom, color: 0xffe14a });
  }

  const layout = () => {
    const { width, height } = app.screen;
    world.position.set(width / 2 + num("x", 0), height / 2 + num("y", 0));
    // Fine white lines, a heavy one every fifth, and diagonals so a shift on either axis shows.
    const w = Math.ceil(width / zoom / GRID / 2 + 6) * GRID;
    const h = Math.ceil(height / zoom / GRID / 2 + 6) * GRID;
    grid
      .clear()
      .rect(-w, -h, w * 2, h * 2)
      .fill(0x10243a);
    for (let x = -w; x <= w; x += GRID) grid.moveTo(x, -h).lineTo(x, h);
    for (let y = -h; y <= h; y += GRID) grid.moveTo(-w, y).lineTo(w, y);
    grid.stroke({ width: 1, color: 0xffffff, alpha: 0.75 });
    for (let x = -w; x <= w; x += GRID * 5) grid.moveTo(x, -h).lineTo(x, h);
    for (let y = -h; y <= h; y += GRID * 5) grid.moveTo(-w, y).lineTo(w, y);
    grid.stroke({ width: 3, color: 0xff8a3d });
    for (let d = -w - h; d <= w + h; d += GRID * 5) {
      grid.moveTo(d - h, -h).lineTo(d + h, h);
    }
    grid.stroke({ width: 1, color: 0x7dff6a, alpha: 0.8 });
  };
  layout();
  app.renderer.on("resize", layout);

  const gl = (app.renderer as WebGLRenderer).gl;
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const medium = gl.getShaderPrecisionFormat(
    gl.FRAGMENT_SHADER,
    gl.MEDIUM_FLOAT,
  )!;
  const info = {
    deviceDpr: window.devicePixelRatio,
    gpu: String(gpu),
    mediumpBits: medium.precision,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    samples: gl.getParameter(gl.SAMPLES) as number,
  };

  const hud = document.getElementById("hud")!;
  const stats = document.createElement("span");
  const links = document.createElement("span");
  hud.append(stats, links);
  const preset = (label: string, params: Record<string, string>) => {
    const next = new URLSearchParams(query);
    for (const [k, v] of Object.entries(params)) next.set(k, v);
    const a = document.createElement("a");
    a.href = `?${next}`;
    a.textContent = label;
    links.append(a);
  };
  preset("reset", {});
  links.querySelector("a")!.setAttribute("href", location.pathname);
  preset("dpr 1", { dpr: "1" });
  preset("dpr 2", { dpr: "2" });
  preset("filterRes 1", { filterRes: "1" });
  preset("aa off", { aa: "off" });
  preset("filter off", { filter: "off" });
  preset("ripple 0", { ripple: "0" });
  preset("ripple 30", { ripple: "30" });
  preset("x4", { count: "4" });
  preset("highp", { precision: "highp" });
  preset("area off", { filterArea: "off" });

  // Frame time is rAF to rAF; render time is the CPU spent inside Pixi's own render listener.
  const frames: number[] = [];
  const renders: number[] = [];
  let last = performance.now();
  let renderStart = 0;
  let sinceHud = 0;
  const lab = { fps: 0, frameMs: 0, worstMs: 0, renderMs: 0, frames: 0, info };
  Object.assign(window, { __domeLab: lab });

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    for (const dome of domes) {
      dome.update(dt);
      const layer = dome.view.children[0];
      if (!on("filterArea")) layer.filterArea = undefined;
      if (!on("filter")) layer.filters = [];
      else if (filterRes > 0)
        (layer.filters as Filter[])[0].resolution = filterRes;
    }
  });
  app.ticker.add(
    () => (renderStart = performance.now()),
    undefined,
    UPDATE_PRIORITY.LOW + 1,
  );
  app.ticker.add(
    () => {
      const now = performance.now();
      renders.push(now - renderStart);
      frames.push(now - last);
      sinceHud += now - last;
      last = now;
      if (frames.length > WINDOW) frames.shift();
      if (renders.length > WINDOW) renders.shift();
      lab.frames++;
      if (sinceHud < 250) return;
      sinceHud = 0;
      const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      lab.frameMs = mean(frames);
      lab.fps = 1000 / lab.frameMs;
      lab.worstMs = Math.max(...frames);
      lab.renderMs = mean(renders);
      const { width, height } = app.canvas;
      stats.innerHTML =
        `<b>${lab.fps.toFixed(1)} fps</b>  ${lab.frameMs.toFixed(1)} ms` +
        ` (worst ${lab.worstMs.toFixed(0)})  render cpu ${lab.renderMs.toFixed(2)} ms\n` +
        `device dpr ${info.deviceDpr}  renderer dpr ${dpr}  canvas ${width}x${height}` +
        `  aa ${on("aa") ? `on (${info.samples} samples)` : "off"}\n` +
        `${info.gpu}  mediump ${info.mediumpBits} bits  max tex ${info.maxTexture}\n` +
        `domes ${count}  radius ${radius}  zoom ${zoom}  ripple ${ripple}` +
        `  filter ${on("filter") ? `on, res ${filterRes || "default"}` : "off"}` +
        `  filterArea ${on("filterArea") ? "on" : "off"}  ${precision}\n`;
    },
    undefined,
    UPDATE_PRIORITY.LOW - 1,
  );
})();

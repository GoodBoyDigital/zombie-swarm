import { Application } from "pixi.js";
import { Audio } from "./audio/Audio";
import { applyBuildLabel } from "./debug/buildLabel";
import { setupDropBar } from "./debug/DropBar";
import { setupTuning } from "./debug/TuningPanel";
import { LEVELS } from "./config/run";
import { createTextures } from "./fx/textures";
import { Game } from "./Game";
import { loadSave } from "./meta/save";

(async () => {
  applyBuildLabel();
  // `?dpr=2` renders at that resolution instead of the screen's own (3 on most phones), to see on a
  // device what the extra pixels cost.
  const dpr = Number(new URLSearchParams(location.search).get("dpr"));
  const app = new Application();
  await app.init({
    // The floor's own black beyond the walls, so the two join without a seam when the touch camera
    // looks out past the arena's margin.
    background: "#000000",
    resizeTo: window,
    antialias: true,
    resolution: dpr || window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById("pixi-container")!.appendChild(app.canvas);
  // Phones: no double-tap zoom or text loupe over the game, and no pinch zoom of the page (Safari).
  app.canvas.addEventListener("touchstart", (e) => e.preventDefault(), {
    passive: false,
  });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  const tex = await createTextures(app.renderer);
  const audio = new Audio();
  void audio.load().then(() => {
    audio.loop("hordeAmbience", 0.35);
    audio.playMusic("synthwaveDread");
  });
  const tuning = setupTuning();

  // Restart tears the whole world down and builds a fresh one on the same app, textures and audio.
  // A fresh page picks up at the furthest level unlocked.
  let game: Game | null = null;
  const start = (level = loadSave().unlockedLevel) => {
    game?.destroy();
    game = new Game(
      app,
      tex,
      audio,
      Math.min(Math.max(0, level), LEVELS.length - 1),
      start,
    );
  };
  tuning.addDrops((def) => game?.dropOrb(def));
  setupDropBar((def) => game?.dropOrb(def));
  start();
})();

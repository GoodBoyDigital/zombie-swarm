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
  const app = new Application();
  await app.init({
    background: "#141210",
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById("pixi-container")!.appendChild(app.canvas);
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

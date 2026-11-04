import { Application } from "pixi.js";
import { Audio } from "./audio/Audio";
import { applyBuildLabel } from "./debug/buildLabel";
import { setupTuning } from "./debug/TuningPanel";
import { createTextures } from "./fx/textures";
import { Game } from "./Game";

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
  let game: Game | null = null;
  const start = () => {
    game?.destroy();
    game = new Game(app, tex, audio, start);
  };
  tuning.addDrops((def) => game?.dropOrb(def));
  start();
})();

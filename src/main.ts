import { Application } from "pixi.js";
import { applyBuildLabel } from "./debug/buildLabel";
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
  new Game(app, await createTextures(app.renderer));
})();

import { defineConfig } from "vite";
import { AssetPack } from "@assetpack/core";
import assetpackConfig from "./.assetpack.js";

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const assetpack = new AssetPack(assetpackConfig);
  let packing: Promise<unknown> | undefined;
  return {
    plugins: [
      {
        name: "assetpack",
        async buildStart() {
          packing ??= command === "serve" ? assetpack.watch() : assetpack.run();
          await packing;
        },
        async closeWatcher() {
          await assetpack.stop();
        },
      },
    ],
    // GitHub Pages serves the game under /<repo>/; the deploy workflow sets BASE_PATH.
    base: process.env.BASE_PATH ?? "/",
    server: {
      port: 8080,
      open: true,
    },
  };
});

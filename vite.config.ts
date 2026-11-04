import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the game under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  server: {
    port: 8080,
    open: true,
    // Opt-in dev-only sampling for the performance worktree. No production headers.
    headers:
      process.env.VITE_BUILD_LABEL === "perf"
        ? { "Document-Policy": "js-profiling" }
        : undefined,
  },
});

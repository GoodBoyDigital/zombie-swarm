/**
 * Asset paths in config are written from the site root ("/sprites/x.png"). The game can be
 * served from a sub-path (GitHub Pages serves it under /zombie-swarm/), so resolve them against
 * Vite's base URL at load time.
 */
export const assetUrl = (path: string): string =>
  import.meta.env.BASE_URL + path.replace(/^\//, "");

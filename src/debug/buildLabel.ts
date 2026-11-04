/**
 * Marks which build this is when several branches run side by side in browser tabs.
 * Set VITE_BUILD_LABEL when starting the dev server, e.g.
 *   VITE_BUILD_LABEL="weapons & pickups" npx vite --port 8082
 * Unset means the main branch.
 */
export function applyBuildLabel(): void {
  if (!import.meta.env.DEV && !import.meta.env.VITE_BUILD_LABEL) return;
  const label = import.meta.env.VITE_BUILD_LABEL || "main";
  document.title = `Zombie Swarm · ${label}`;
  const badge = document.createElement("div");
  badge.textContent = label;
  Object.assign(badge.style, {
    position: "fixed",
    top: "8px",
    right: "8px",
    padding: "4px 10px",
    font: "bold 13px monospace",
    color: "#111",
    background: label === "main" ? "#9ad15a" : "#ffb347",
    border: "2px solid #111",
    borderRadius: "3px",
    pointerEvents: "none",
    zIndex: "10",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(badge);
}

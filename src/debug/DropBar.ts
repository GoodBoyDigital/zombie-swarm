import {
  POWERUP_CATEGORIES,
  POWERUP_DEFS,
  type PowerupDef,
} from "../config/powerups";
import { IS_MOBILE } from "../core/device";
import { isTyping } from "../Game";

/**
 * Dev builds only: a strip of buttons along the bottom of the screen, one per power-up and gun in
 * its orb colour. Clicking one drops that orb just ahead of the player. O hides or shows it.
 */
export function setupDropBar(drop: (def: PowerupDef) => void): void {
  if (!import.meta.env.DEV) return;
  const bar = document.createElement("div");
  Object.assign(bar.style, {
    position: "fixed",
    left: "50%",
    bottom: "8px",
    transform: "translateX(-50%)",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "4px",
    maxWidth: "calc(100vw - 24px)",
    zIndex: "10",
  } satisfies Partial<CSSStyleDeclaration>);
  for (const def of POWERUP_DEFS) {
    const button = document.createElement("button");
    button.textContent = def.name;
    button.title = `Drop ${def.name} (O hides this bar)`;
    Object.assign(button.style, {
      font: "bold 11px monospace",
      padding: "3px 7px",
      color: "#fff",
      background: `#${POWERUP_CATEGORIES[def.category].color.toString(16).padStart(6, "0")}`,
      border: "2px solid #151a15",
      borderRadius: "3px",
      textShadow: "0 1px 0 #151a15",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    // Never take focus, so arrow keys and space keep driving the game after a click.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => drop(def));
    bar.appendChild(button);
  }
  // The bar's own `display` beats the `hidden` attribute, so hiding has to go through the style.
  const show = (on: boolean) => (bar.style.display = on ? "flex" : "none");
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyO" && !isTyping(e)) show(bar.style.display === "none");
  });
  // On a phone it would sit under the thumbs, and there is no O key to bring it back.
  show(!IS_MOBILE);
  document.body.appendChild(bar);
}

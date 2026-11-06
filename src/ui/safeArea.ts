/**
 * A phone's notch and rounded corners, as CSS px in from the screen edges the HUD hangs off (zero
 * on a desktop). style.css copies the browser's `env(safe-area-inset-*)` into custom properties;
 * this reads them back, again whenever the window resizes or the phone turns.
 */
export const SAFE_AREA = { top: 0, left: 0 };

const read = (): void => {
  const css = getComputedStyle(document.documentElement);
  for (const side of ["top", "left"] as const)
    SAFE_AREA[side] = parseFloat(css.getPropertyValue(`--safe-${side}`)) || 0;
};
read();
window.addEventListener("resize", read);

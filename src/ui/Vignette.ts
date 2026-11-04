import { Sprite, Texture, type Application } from "pixi.js";

const COLOR = "255, 40, 30";
/** How fast a hit flash fades, per second. */
const FLASH_DECAY = 5;
const FLASH_ALPHA = 0.9;
/** Below this health fraction the edges stay tinted and pulse. */
const LOW_FRACTION = 0.3;
const LOW_ALPHA = 0.28;
const PULSE_HZ = 1.4;

/** Red screen-edge glow in screen space: flashes on a hit and throbs when health is low. */
export class Vignette {
  readonly view: Sprite;
  private flash = 0;
  private low = 0;
  private pulse = 0;

  constructor(private readonly app: Application) {
    this.view = new Sprite(makeTexture());
    this.view.alpha = 0;
    this.view.eventMode = "none";
    this.fit();
    app.renderer.on("resize", () => this.fit());
  }

  hit(): void {
    this.flash = FLASH_ALPHA;
  }

  update(dt: number, healthFraction: number): void {
    this.flash *= Math.exp(-dt * FLASH_DECAY);
    this.pulse += dt * PULSE_HZ * Math.PI * 2;
    this.low =
      healthFraction > 0 && healthFraction <= LOW_FRACTION
        ? LOW_ALPHA * (0.75 + 0.25 * Math.sin(this.pulse))
        : 0;
    this.view.alpha = Math.max(this.flash, this.low);
  }

  private fit(): void {
    this.view.width = this.app.screen.width;
    this.view.height = this.app.screen.height;
  }
}

/** A small radial gradient, clear in the middle and red at the edges; the sprite stretches it over the screen. */
function makeTexture(): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.25,
    size / 2,
    size / 2,
    size * 0.72,
  );
  g.addColorStop(0, `rgba(${COLOR}, 0)`);
  g.addColorStop(1, `rgba(${COLOR}, 1)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

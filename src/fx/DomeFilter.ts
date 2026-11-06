import {
  defaultFilterVert,
  Filter,
  GlProgram,
  Texture,
  UniformGroup,
  type FilterSystem,
  type Renderer,
  type RenderSurface,
  type WebGLRenderer,
} from "pixi.js";

/**
 * Ripples whatever is already drawn behind its container (floor, corpses, zombies) through a scrolling
 * noise map, inside a circle centred in the container's bounds, then lays the container's own pixels
 * on top. Pixi's DisplacementFilter only warps a container's own children, so this reads the backdrop
 * instead, and costs a pass the size of the dome, not the screen.
 */
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform sampler2D uNoise;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uInputClamp;

uniform vec2 uBackScale;
uniform float uRadius;
uniform float uStrength;
uniform float uNoiseScale;
uniform float uTime;

void main() {
    // Screen px from the middle of the filter bounds, which are centred on the dome.
    vec2 px = vTextureCoord * uInputSize.xy - uOutputFrame.zw * 0.5;
    float r = length(px) / uRadius;
    // Strongest in a band inside the rim; the middle, where the player stands, stays clean.
    float inside = smoothstep(0.15, 0.6, r) * (1.0 - smoothstep(0.85, 1.0, r));
    vec2 p = px * uNoiseScale;
    vec2 n = texture(uNoise, p + vec2(uTime * 0.11, uTime * 0.07)).rg
           + texture(uNoise, p * 1.9 - vec2(uTime * 0.05, uTime * 0.16)).rg - 1.0;
    vec2 offset = n * uStrength * inside * uInputSize.zw;
    // A slight colour split sells it as energy rather than water.
    vec4 back = texture(uBackTexture, clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw) * uBackScale);
    back.r = texture(uBackTexture, clamp(vTextureCoord + offset * 1.35, uInputClamp.xy, uInputClamp.zw) * uBackScale).r;
    back.b = texture(uBackTexture, clamp(vTextureCoord + offset * 0.65, uInputClamp.xy, uInputClamp.zw) * uBackScale).b;
    vec4 front = texture(uTexture, vTextureCoord);
    finalColor = front + back * (1.0 - front.a);
}
`;

/** Domes on screen. The WebGL back buffer is on only while there is at least one. */
let users = 0;
let backBuffer: { useBackBuffer: boolean } | null = null;
let noise: Texture | null = null;

export class DomeFilter extends Filter {
  /** Set after its first prepare; from the next frame on the back buffer is known to be live. */
  private primed = false;

  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment,
        name: "dome-filter",
      }),
      blendRequired: true,
      // Bounds stay centred on the dome even when it hangs off the screen edge.
      clipToViewport: false,
      resources: {
        domeUniforms: new UniformGroup({
          uBackScale: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
          uRadius: { value: 1, type: "f32" },
          uStrength: { value: 0, type: "f32" },
          uNoiseScale: { value: 1, type: "f32" },
          uTime: { value: 0, type: "f32" },
        }),
        uNoise: noiseTexture().source,
        uBackTexture: Texture.EMPTY,
      },
    });
    // Off until prepare has seen the back buffer running.
    this.enabled = false;
    users++;
  }

  get uniforms(): {
    uBackScale: Float32Array;
    /** Dome radius, screen px. */
    uRadius: number;
    uStrength: number;
    /** Ripple features per screen px. */
    uNoiseScale: number;
    uTime: number;
  } {
    return this.resources.domeUniforms.uniforms;
  }

  /**
   * Call from the filtered container's onRender. WebGL can only read behind a filter while the frame
   * renders into a back buffer, a full-screen copy, so it is switched on just while a dome is up. The
   * switch lands at the start of the next frame, so every new filter sits out its first one (two domes
   * opening together can't tell which of them switched it on).
   */
  prepare(renderer: Renderer): void {
    const bb = (renderer as WebGLRenderer).backBuffer;
    if (!bb) return;
    this.enabled = this.primed;
    this.primed = true;
    // Pixi resolves the whole back buffer once for every filter that reads it. Multisampled, that is
    // about 4 ms a dome on a phone at 3x, whatever the dome's size, so the back buffer goes without.
    if (backBuffer !== bb) bb.init({ antialias: false });
    bb.useBackBuffer = true;
    backBuffer = bb;
  }

  /**
   * The backdrop is copied at the renderer's resolution into a pooled texture of its own, while the
   * input is at the filter's. The two only share a UV scale by luck (at 1x and 2x, not at 3x), so
   * the backdrop gets its own.
   */
  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const back = filterManager.activeBackTexture;
    if (back) {
      const scale = this.uniforms.uBackScale;
      scale[0] = input.source.width / back.source.width;
      scale[1] = input.source.height / back.source.height;
    }
    filterManager.applyFilter(this, input, output, clearMode);
  }

  override destroy(): void {
    super.destroy();
    users--;
    if (users === 0 && backBuffer) backBuffer.useBackBuffer = false;
  }
}

const NOISE_SIZE = 64;
const NOISE_GRID = 8;

/** Tileable smooth value noise, independent in red and green, shared by every dome. */
function noiseTexture(): Texture {
  if (noise) return noise;
  const lattice = Array.from({ length: NOISE_GRID * NOISE_GRID * 2 }, () =>
    Math.random(),
  );
  const at = (x: number, y: number, c: number) =>
    lattice[(((y % NOISE_GRID) * NOISE_GRID + (x % NOISE_GRID)) * 2 + c) | 0];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = NOISE_SIZE;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(NOISE_SIZE, NOISE_SIZE);
  const cell = NOISE_SIZE / NOISE_GRID;
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const fx = smooth((x % cell) / cell);
      const fy = smooth((y % cell) / cell);
      const i = (y * NOISE_SIZE + x) * 4;
      for (let c = 0; c < 2; c++) {
        const top = at(gx, gy, c) * (1 - fx) + at(gx + 1, gy, c) * fx;
        const bottom =
          at(gx, gy + 1, c) * (1 - fx) + at(gx + 1, gy + 1, c) * fx;
        img.data[i + c] = Math.round((top * (1 - fy) + bottom * fy) * 255);
      }
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  noise = Texture.from(canvas);
  noise.source.addressMode = "repeat";
  return noise;
}

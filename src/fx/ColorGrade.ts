import {
  Container,
  defaultFilterVert,
  Filter,
  GlProgram,
  Texture,
  UniformGroup,
  type FilterSystem,
  type Rectangle,
  type RenderSurface,
  type RenderTexture,
} from "pixi.js";
import type { GradeDef } from "../config/grade";

/**
 * Two 3x4 colour matrices, one row per output channel: rgb weights then an offset. `world` grades
 * everything but what the spare mask covers (the player), then `all` grades the lot.
 */
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uSpare;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;

uniform vec4 uWorldR;
uniform vec4 uWorldG;
uniform vec4 uWorldB;
uniform vec4 uAllR;
uniform vec4 uAllG;
uniform vec4 uAllB;
uniform highp vec4 uSpareFrame;
uniform float uSpareOn;

vec3 grade(vec3 c, vec4 r, vec4 g, vec4 b) {
    return vec3(dot(c, r.rgb) + r.a, dot(c, g.rgb) + g.a, dot(c, b.rgb) + b.a);
}

void main() {
    vec4 src = texture(uTexture, vTextureCoord);
    vec3 rgb = src.a > 0.0 ? src.rgb / src.a : src.rgb;
    vec3 c = grade(rgb, uWorldR, uWorldG, uWorldB);
    if (uSpareOn > 0.5) {
        // Screen px of this fragment, then into the spare mask's box.
        vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
        vec2 uv = (screen - uSpareFrame.xy) * uSpareFrame.zw;
        if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0)
            c = mix(c, rgb, smoothstep(0.0, 0.5, texture(uSpare, uv).a));
    }
    c = clamp(grade(c, uAllR, uAllG, uAllB), 0.0, 1.0);
    finalColor = vec4(c * src.a, src.a);
}
`;

/** Where the spare mask sits on screen, and what it holds: alpha 1 keeps the original colour. */
export interface SpareMask {
  readonly texture: RenderTexture;
  /** Screen box the texture covers, CSS px. */
  readonly frame: Rectangle;
}

type Matrix = Float32Array;
const LUMA = [0.2126, 0.7152, 0.0722];

const identity = (into: Matrix = new Float32Array(12)): Matrix => {
  into.fill(0);
  into[0] = into[5] = into[10] = 1;
  return into;
};

const product = new Float32Array(12);
const ID = identity();

/** `a` applied after `b`, written into `out` (which may be `b`). */
function multiply(a: Matrix, b: Matrix, out: Matrix): void {
  const r = product;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      let v = col === 3 ? a[row * 4 + 3] : 0;
      for (let k = 0; k < 3; k++) v += a[row * 4 + k] * b[k * 4 + col];
      r[row * 4 + col] = v;
    }
  }
  out.set(r);
}

/** Saturation, then contrast and brightness, then tint, eased from no change by `weight`. */
function gradeMatrix(def: GradeDef, weight: number, out: Matrix): Matrix {
  const tint = [def.tint.r, def.tint.g, def.tint.b];
  const gain = def.contrast * def.brightness;
  const lift = 0.5 * (1 - def.contrast) * def.brightness;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const sat =
        (row === col ? def.saturation : 0) + (1 - def.saturation) * LUMA[col];
      out[row * 4 + col] = sat * gain * tint[row];
    }
    out[row * 4 + 3] = lift * tint[row];
  }
  for (let i = 0; i < 12; i++) out[i] = ID[i] + (out[i] - ID[i]) * weight;
  return out;
}

class GradeFilter extends Filter {
  spare: SpareMask | null = null;

  constructor() {
    const vec4 = () => ({
      value: new Float32Array(4),
      type: "vec4<f32>" as const,
    });
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment,
        name: "color-grade",
      }),
      resources: {
        gradeUniforms: new UniformGroup({
          uWorldR: vec4(),
          uWorldG: vec4(),
          uWorldB: vec4(),
          uAllR: vec4(),
          uAllG: vec4(),
          uAllB: vec4(),
          uSpareFrame: vec4(),
          uSpareOn: { value: 0, type: "f32" },
        }),
        uSpare: Texture.WHITE.source,
      },
    });
  }

  get uniforms(): Record<string, Float32Array> & { uSpareOn: number } {
    return this.resources.gradeUniforms.uniforms;
  }

  setMatrices(world: Matrix, all: Matrix): void {
    const u = this.uniforms;
    u.uWorldR.set(world.subarray(0, 4));
    u.uWorldG.set(world.subarray(4, 8));
    u.uWorldB.set(world.subarray(8, 12));
    u.uAllR.set(all.subarray(0, 4));
    u.uAllG.set(all.subarray(4, 8));
    u.uAllB.set(all.subarray(8, 12));
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.uniforms;
    const spare = this.spare;
    u.uSpareOn = spare ? 1 : 0;
    if (spare) {
      const f = spare.frame;
      u.uSpareFrame.set([f.x, f.y, 1 / f.width, 1 / f.height]);
      this.resources.uSpare = spare.texture.source;
    }
    filterManager.applyFilter(this, input, output, clearMode);
  }
}

/**
 * One colour-grade pass over everything in `view` (the world, under the HUD). Sources call `add`
 * each frame with a look and a weight; the looks compose into a single filter, and with no source
 * adding anything the filter is off and costs nothing. Looks can spare the player, who then keeps
 * his colour through a mask (src/fx/PlayerMask.ts) while the world around him is graded.
 */
export class ColorGrade {
  readonly view = new Container({ label: "graded" });
  private readonly filter = new GradeFilter();
  private readonly world = identity();
  private readonly all = identity();
  private readonly scratch = new Float32Array(12);
  private active = false;
  private filtered = false;
  /** Something this frame grades the world but not the player, so the spare mask is needed. */
  sparing = false;

  constructor(screen: Rectangle) {
    // Screen-sized and fixed, so the world's huge bounds are never measured.
    this.view.filterArea = screen;
  }

  /** Start a frame: no looks. */
  begin(): void {
    identity(this.world);
    identity(this.all);
    this.active = false;
    this.sparing = false;
  }

  /** Blend toward `def` by `weight` (0..1). With `sparePlayer`, the player keeps his colour. */
  add(def: GradeDef, weight: number, sparePlayer = false): void {
    if (weight <= 0) return;
    const m = gradeMatrix(def, Math.min(1, weight), this.scratch);
    const into = sparePlayer ? this.world : this.all;
    multiply(m, into, into);
    this.active = true;
    if (sparePlayer) this.sparing = true;
  }

  /** End a frame: push the composed looks to the filter, or switch it off. */
  apply(spare: SpareMask): void {
    const on = this.active;
    if (on !== this.filtered) {
      this.filtered = on;
      this.view.filters = on ? [this.filter] : [];
    }
    if (!on) return;
    this.filter.setMatrices(this.world, this.all);
    this.filter.spare = this.sparing ? spare : null;
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.filter.destroy();
  }
}

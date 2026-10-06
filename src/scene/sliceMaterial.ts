import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
  type Texture,
} from "three";
import fragmentShader from "../shaders/slice.frag.glsl?raw";
import vertexShader from "../shaders/slice.vert.glsl?raw";
import { FOG_DENSITY } from "./constants";


export type SliceUniforms = ReturnType<typeof sliceUniforms>;

function sliceUniforms(blank: Texture, width: number, height: number, seed: number, floorY: number) {
  return {
    uMapLow: { value: blank },
    uMapHigh: { value: blank },
    uLowReady: { value: 0 },
    uHigh: { value: 0 },
    uDetail: { value: 0 },
    uFocus: { value: 0 },
    uHover: { value: 0 },
    uDim: { value: 0 },
    uVisibility: { value: 0 },
    uFlare: { value: 0 },
    uTime: { value: 0 },
    uSeed: { value: seed },
    uFogDensity: { value: FOG_DENSITY },
    uFloorY: { value: floorY },
    uTint: { value: new Color("#8fc4ff") },
    uSize: { value: new Vector2(width, height) },
    uBend: { value: 0 },
    uDrag: { value: 0 },
    uRipple: { value: 0 },
  };
}

/**
 * Every slice uses this material. All instances share one compiled program;
 * each carries only its own small set of uniforms.
 */
export function createSliceMaterial(options: { blank: Texture; width: number; height: number; seed: number; floorY: number }) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: sliceUniforms(options.blank, options.width, options.height, options.seed, options.floorY),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    premultipliedAlpha: true,
  });
}

export const uniformsOf = (material: ShaderMaterial) => material.uniforms as SliceUniforms;

/** Mirror one slice's current appearance onto another surface. */
export function copySliceUniforms(from: ShaderMaterial, to: ShaderMaterial) {
  const a = uniformsOf(from);
  const b = uniformsOf(to);
  for (const key of Object.keys(a) as (keyof SliceUniforms)[]) {
    const value = a[key].value;
    if (value instanceof Color || value instanceof Vector2) (b[key].value as Color | Vector2).copy(value as never);
    else (b[key] as { value: unknown }).value = value;
  }
}

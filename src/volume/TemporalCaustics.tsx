import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AddEquation,
  CustomBlending,
  GLSL3,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Mesh,
} from "three";
import { fieldPhase, smoothstep, SWAP_POINT } from "../engine";
import { FOG_DENSITY } from "../scene/constants";
import { useRuntime } from "../scene/runtime";
import fragmentShader from "../shaders/caustics.frag.glsl?raw";
import vertexShader from "../shaders/caustics.vert.glsl?raw";
import { SPECTRAL_LOOK, SPECTRAL_QUALITY, withSpectral } from "./SpectralLook";
import { WAVE_SLOTS } from "./TemporalVolumeMaterial";

/** Spill beyond the block's footprint, world units. */
const MARGIN = 5;
/** Gap between the block's underside and the light it casts. */
const DROP = 0.9;
/** Light beneath the block at rest, relative to SPECTRAL_LOOK.caustics. */
const STRENGTH = 0.09;

/**
 * Faint caustic light beneath the volume, as if the block focused light
 * onto haze below it. An invisible receiving plane: additive light only,
 * fading to nothing well before its edges.
 */
export function TemporalCaustics() {
  const runtime = useRuntime();
  const { layout } = runtime;
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(
    () => new PlaneGeometry(layout.sliceWidth + MARGIN * 2, layout.depth + MARGIN * 2),
    [layout],
  );
  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: withSpectral(fragmentShader),
        uniforms: {
          uTime: { value: 0 },
          uWaves: { value: Array.from({ length: WAVE_SLOTS }, () => new Vector4()) },
          uFootprint: { value: new Vector4(layout.sliceWidth / 2, layout.frontZ, layout.frontZ - layout.depth, layout.spacing) },
          uFocus: { value: new Vector2(-1, 0) },
          uStrength: { value: 0 },
          uWarmth: { value: SPECTRAL_LOOK.warmAccent },
          uFogDensity: { value: FOG_DENSITY },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        premultipliedAlpha: true,
      }),
    [layout],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const waves = useMemo(() => new Float32Array(WAVE_SLOTS * 4), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const T = runtime.transition;
    const strength =
      SPECTRAL_LOOK.caustics * SPECTRAL_QUALITY[runtime.quality].caustics * STRENGTH * smoothstep(0.3, 1, runtime.intro);
    m.visible = T.progress < SWAP_POINT && strength > 0;
    if (!m.visible) return;
    const u = material.uniforms;
    u.uTime.value = runtime.clock;
    runtime.waves.write(waves);
    (u.uWaves.value as Vector4[]).forEach((v, i) => v.fromArray(waves, i * 4));
    const cur = runtime.focus.current;
    u.uFocus.value.set(cur.index, cur.index >= 0 ? cur.amount : 0);
    u.uStrength.value = strength * (1 - fieldPhase(T.progress).dim * 0.9);
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      position={[0, -layout.sliceHeight / 2 - DROP, layout.frontZ - layout.depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  GLSL3,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from "three";
import fragmentShader from "../shaders/temporal-volume.frag.glsl?raw";
import vertexShader from "../shaders/temporal-volume.vert.glsl?raw";
import { EXTRACT, SEPARATION, type TemporalLayout } from "../engine";
import { FOG_DENSITY } from "../scene/constants";
import { SPECTRAL_LOOK, SPECTRAL_QUALITY, withSpectral, type SpectralQuality } from "./SpectralLook";

/**
 * Look of the resting volume. One slice absorbs `absorb` of the light
 * behind it; ~200 slices together become nearly opaque. `gain` is the
 * emission for imagery of `referenceLuminance`; brighter archives emit less
 * (see exposureGain) so the block never burns out to white.
 */
export const VOLUME_LOOK = {
  absorb: 0.016,
  gain: 1.7,
  blur: 3.4,
  rim: 0.32,
  ghost: 0.07,
  focusDim: 0.2,
  referenceLuminance: 0.023,
};

/** Emission gain for imagery of a given mean linear luminance (square-root law). */
export function exposureGain(meanLuminance: number | null) {
  if (meanLuminance === null || meanLuminance <= 0) return VOLUME_LOOK.gain;
  const k = Math.sqrt(VOLUME_LOOK.referenceLuminance / meanLuminance);
  return VOLUME_LOOK.gain * Math.min(1.3, Math.max(0.2, k));
}

export const WAVE_SLOTS = 4;

const L = SPECTRAL_LOOK;

function volumeUniformsFor(options: { layout: TemporalLayout; images: Texture; blank: Texture }) {
  const { layout } = options;
  return {
    uTime: { value: 0 },
    uCount: { value: layout.count },
    uSpacing: { value: layout.spacing },
    uFrontZ: { value: layout.frontZ },
    uSize: { value: new Vector2(layout.sliceWidth, layout.sliceHeight) },
    uPixelScale: { value: 1000 },

    uCursor: { value: 0 },
    uTravel: { value: 0 },
    uWaves: { value: Array.from({ length: WAVE_SLOTS }, () => new Vector4()) },
    uFocus: { value: new Vector4(-1, 0, -1, 0) },
    uExtract: {
      value: new Vector4(EXTRACT.side * layout.sliceWidth, EXTRACT.lift * layout.sliceHeight, EXTRACT.forward, EXTRACT.yaw),
    },
    uFocusScale: { value: new Vector2(1, 1) },
    uSeparation: { value: new Vector2(SEPARATION.slices, SEPARATION.reach) },
    uHover: { value: new Vector2(-1, 0) },
    uEnter: { value: new Vector3() },

    uIntro: { value: 0 },
    uGhost: { value: VOLUME_LOOK.ghost },
    uDim: { value: 0 },
    uFocusDim: { value: VOLUME_LOOK.focusDim },
    uAbsorb: { value: VOLUME_LOOK.absorb },
    uGain: { value: VOLUME_LOOK.gain },
    uBlur: { value: VOLUME_LOOK.blur },
    uRim: { value: VOLUME_LOOK.rim },

    uImages: { value: options.images },
    uHighA: { value: options.blank },
    uHighB: { value: options.blank },
    uHighReady: { value: 0 },
    uCold: { value: new Color("#a9c3ea") },
    uLight: { value: new Vector3(-0.35, 0.75, 0.55).normalize() },
    uFogDensity: { value: FOG_DENSITY },

    // Optics: see SPECTRAL_LOOK. Values that change per frame or with
    // quality are written by TemporalVolume (and applyQuality).
    uFilm: { value: new Vector4(L.iridescence, L.fresnelPower, L.filmThickness, L.depthPhase) },
    uFilmLight: { value: new Vector2(L.filmGain, L.warmAccent) },
    uHighlight: { value: new Vector2(L.highlight, L.sheen) },
    uMotionOptics: { value: new Vector3(L.waveColour, L.breathing, L.motionBoost) },
    uMotion: { value: 0 },
    uNeighbour: { value: new Vector3(L.neighbour, L.neighbourReach, 0) },
    uFocusFilm: { value: new Vector3(L.focusBoost, L.focusResidual, L.enterBoost) },
    uPassage: { value: new Vector4() },
    uRings: { value: L.passageRings },
    uVolumeOptics: { value: new Vector3(L.bands, L.caustics, L.dispersion) },
  };
}

/** Switch optional optical features for a quality level. */
export function applyQuality(material: ShaderMaterial, quality: SpectralQuality) {
  const q = SPECTRAL_QUALITY[quality];
  const u = volumeUniforms(material);
  u.uMotionOptics.value.x = L.waveColour * q.waveColour;
  u.uVolumeOptics.value.set(L.bands * q.bands, L.caustics * q.caustics, L.dispersion * q.dispersion);
}

export type VolumeUniforms = ReturnType<typeof volumeUniformsFor>;

/** One material, one program, one draw call for the whole volume. */
export function createVolumeMaterial(options: { layout: TemporalLayout; images: Texture; blank: Texture }) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: withSpectral(vertexShader),
    fragmentShader: withSpectral(fragmentShader),
    uniforms: volumeUniformsFor(options),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    premultipliedAlpha: true,
  });
}

export const volumeUniforms = (material: ShaderMaterial) => material.uniforms as VolumeUniforms;

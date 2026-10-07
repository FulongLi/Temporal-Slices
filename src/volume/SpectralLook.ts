import spectralChunk from "../shaders/spectral.glsl?raw";

/**
 * Art direction for the archive's optics, in one place.
 *
 * The temporal material does not merely reflect light: it separates, bends
 * and carries it through time. At rest it stays mostly silver, black and
 * pale blue; colour comes from viewing angle, movement, waves, focus and the
 * passage, and from density (one membrane barely tints, hundreds become an
 * optical body). Every number here is a multiplier or a shape parameter of
 * a term in `shaders/spectral.glsl` or the shaders that use it.
 */
export const SPECTRAL_LOOK = {
  // ── Thin film ──
  /** Colour at grazing incidence on the resting volume. */
  iridescence: 1.6,
  /** Exponent of the Fresnel term gating it: higher keeps colour to the most oblique views. */
  fresnelPower: 2.6,
  /** How far the colour travels through the palette as the view turns oblique. */
  filmThickness: 3.4,
  /** Phase drift per slice: colour carried slowly through depth. */
  depthPhase: 0.0011,
  /** Light one membrane reflects, relative to its absorption; density turns it into a body. */
  filmGain: 0.32,
  /** 0..1, how much gold and magenta the palette lets through. */
  warmAccent: 0.6,

  // ── Highlights ──
  /** Narrow anisotropic spectral streak. */
  highlight: 1,
  /** Soft silver reflection toward grazing angles. */
  sheen: 0.6,

  // ── Motion ──
  /** Spectral pulse carried by travelling waves. */
  waveColour: 1,
  /** Phase drift of the slow breathing (very small). */
  breathing: 0.035,
  /** Extra colour while the camera moves or time is travelled. */
  motionBoost: 0.9,

  // ── Inside the volume ──
  /** Internal light bands drifting through the block. */
  bands: 1,
  /** Fake caustics inside the volume and on the haze beneath it. */
  caustics: 1,
  /** Chromatic dispersion: rim separation (px) and image separation. */
  dispersion: 1,

  // ── Focus and passage ──
  /** Film on the extracted slice while it is drawn out. */
  focusBoost: 1,
  /** Film left on the extracted slice once it has settled. */
  focusResidual: 0.16,
  /** Spectral disturbance in the neighbours of an extracted slice. */
  neighbour: 0.8,
  /** Its reach, in slices (exponential falloff). */
  neighbourReach: 7,
  /** Optics of the Enter Slice passage, overall. */
  enterBoost: 1,
  /** Film over the entered membrane at its strongest. */
  passageFilm: 0.4,
  /** Newton's rings inside the spreading disc (they strengthen at the crossing). */
  passageRings: 0.35,
  /** Radial separation of wavelengths across the entered membrane, at its peak (uv per uv from centre). */
  passageDispersion: 0.012,
};

/**
 * Quality levels. High has everything; medium keeps iridescence and wave
 * colour; low keeps only the Fresnel spectral tint. Highlights, rims and the
 * film on the focused slice cost almost nothing and stay at every level.
 */
export type SpectralQuality = "high" | "medium" | "low";

export interface SpectralFeatures {
  waveColour: number;
  bands: number;
  caustics: number;
  dispersion: number;
}

export const SPECTRAL_QUALITY: Record<SpectralQuality, SpectralFeatures> = {
  high: { waveColour: 1, bands: 1, caustics: 1, dispersion: 1 },
  medium: { waveColour: 1, bands: 0, caustics: 0, dispersion: 0 },
  low: { waveColour: 0, bands: 0, caustics: 0, dispersion: 0 },
};

const LEVELS: SpectralQuality[] = ["low", "medium", "high"];

export function parseQuality(value: string | null | undefined, fallback: SpectralQuality = "high"): SpectralQuality {
  return LEVELS.includes(value as SpectralQuality) ? (value as SpectralQuality) : fallback;
}

/** One level down (or up), clamped. */
export function stepQuality(quality: SpectralQuality, step: -1 | 1): SpectralQuality {
  const i = LEVELS.indexOf(quality) + step;
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))];
}

/** Resolve `#include <spectral>` in a shader source. */
export const withSpectral = (source: string) => source.replace("#include <spectral>", spectralChunk);

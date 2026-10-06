import { clamp, smoothstep } from "./math";

/**
 * Progressive disclosure. A slice's level of detail depends on how far it
 * lies from the present along the time axis, measured in slices.
 * Everything is continuous: levels blend rather than switch.
 */

export type LODLevel = "far" | "mid" | "near";

export interface LODOptions {
  /** Within this many slices of the present, a slice is fully detailed. */
  near: number;
  /** Beyond this many slices, a slice is reduced to a luminous outline. */
  far: number;
  /** Slices this far ahead fade out entirely. */
  horizon: number;
  /** Past slices (already travelled through) fall off faster by this factor. */
  pastFalloff: number;
}

export const DEFAULT_LOD: LODOptions = { near: 1.6, far: 6.5, horizon: 30, pastFalloff: 2.4 };

export interface LODState {
  /** 0 = far, 0.5 = mid, 1 = near. */
  detail: number;
  far: number;
  mid: number;
  near: number;
  /** Overall presence of the slice in the field, 0..1. */
  visibility: number;
  level: LODLevel;
  /** Whether full-resolution imagery is worth holding in memory. */
  wantsHighRes: boolean;
}

/** @param offset slice index minus the (fractional) present position. Positive = future. */
export function computeLOD(offset: number, options: LODOptions = DEFAULT_LOD): LODState {
  const distance = offset >= 0 ? offset : -offset * options.pastFalloff;
  const near = 1 - smoothstep(options.near * 0.45, options.near * 1.35, distance);
  const far = smoothstep(options.far * 0.65, options.far * 1.25, distance);
  const mid = clamp(1 - near - far);
  const detail = clamp(near + mid * 0.5);
  // Moments already travelled through dissolve quickly so they never veil the present.
  const passed = offset < 0 ? 1 - smoothstep(0.25, 1.05, -offset) : 1;
  const visibility = passed * (1 - smoothstep(options.horizon * 0.7, options.horizon, distance));
  const level: LODLevel = detail > 0.75 ? "near" : detail > 0.25 ? "mid" : "far";
  return { detail, far, mid, near, visibility, level, wantsHighRes: distance < options.near * 1.6 };
}

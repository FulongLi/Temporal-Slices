import { add, clamp, easeInOutCubic, length, mix3, scale, smoothstep, sub, type Vec3 } from "./math";
import type { ObserverPose } from "./TemporalLayout";

/**
 * The Enter Slice timeline.
 *
 * One progress value p ∈ [0, 1] drives the whole passage. Entering runs it
 * forward; Escape runs the very same curves backward, so the return is an
 * exact reversal rather than a separate animation.
 *
 *   0 ─────────── SWAP ─────────────── 1
 *   field: others dim, the slice      moment: the camera continues through
 *   turns, lifts and grows, the       the membrane (the same surface, now
 *   camera closes in until the        in the moment's own space) and the
 *   surface covers the viewport       moment opens up behind it
 *
 * At SWAP the slice covers the viewport exactly as the membrane does from
 * the moment camera, so the change of space is invisible.
 */

export const SWAP_POINT = 0.56;

/** Where the approach begins, leaving a beat for the field to dim first. */
const APPROACH_START = 0.05;

/** Distance from the moment camera to the membrane when the swap happens. */
export const MEMBRANE_DISTANCE = 2;
/** How far beyond the membrane the camera comes to rest. */
export const MOMENT_DEPTH = 0.95;

export interface TransitionTiming {
  enter: number;
  exit: number;
}

export function transitionTiming(reducedMotion: boolean): TransitionTiming {
  return reducedMotion ? { enter: 0.9, exit: 0.7 } : { enter: 3.6, exit: 2.8 };
}

/** Advance progress toward its goal at the rate implied by `timing`. */
export function advanceProgress(p: number, entering: boolean, dt: number, timing: TransitionTiming) {
  return entering ? Math.min(1, p + dt / timing.enter) : Math.max(0, p - dt / timing.exit);
}

/** Cubic Hermite from 0 to 1 with chosen start and end slopes. */
export function hermite(t: number, m0: number, m1: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
}

/** Approach arrives with some remaining speed so the plunge never stalls. */
const ARRIVAL_SLOPE = 0.85;

export interface FieldPhase {
  /** How much the rest of the field darkens. */
  dim: number;
  /** The selected slice turning, lifting and enlarging. */
  lift: number;
  /** Camera progress toward the cover pose. */
  approach: number;
  /** Surface distortion. */
  distort: number;
}

export function fieldPhase(p: number): FieldPhase {
  const t = clamp((p - APPROACH_START) / (SWAP_POINT - APPROACH_START));
  return {
    dim: smoothstep(0, 0.28, p),
    lift: easeInOutCubic(smoothstep(0, 0.32, p)),
    approach: hermite(t, 0, ARRIVAL_SLOPE),
    distort: smoothstep(0.2, SWAP_POINT, p),
  };
}

export interface MomentPhase {
  /** Normalised progress through the moment part. */
  q: number;
  /** Camera z in moment space (0 at swap, negative going in). */
  cameraZ: number;
  /** Signed distance from camera to membrane; negative once passed. */
  toMembrane: number;
  /** Opacity of the membrane as the camera meets it. */
  membrane: number;
  /** Brief bloom at the crossing. */
  flare: number;
  /** Distortion of the membrane, rising toward contact. */
  ripple: number;
}

/**
 * Initial slope of the moment travel that matches the speed at which the
 * camera arrived in the field. `startRatio` is the camera's distance to the
 * slice at p = 0 divided by the cover distance.
 */
export function matchedEntrySlope(startRatio: number) {
  const fieldSpan = SWAP_POINT - APPROACH_START;
  const momentSpan = 1 - SWAP_POINT;
  const fieldRate = ((startRatio - 1) * ARRIVAL_SLOPE) / fieldSpan; // in cover-distance units / p
  const travel = (MEMBRANE_DISTANCE + MOMENT_DEPTH) / MEMBRANE_DISTANCE; // in membrane units
  return clamp((fieldRate * momentSpan) / travel, 0.3, 2.6);
}

export function momentPhase(p: number, entrySlope = 1): MomentPhase {
  const q = clamp((p - SWAP_POINT) / (1 - SWAP_POINT));
  const travel = hermite(q, entrySlope, 0);
  const cameraZ = -travel * (MEMBRANE_DISTANCE + MOMENT_DEPTH);
  const toMembrane = cameraZ + MEMBRANE_DISTANCE;
  const membrane = smoothstep(0.04, 0.55, toMembrane);
  const flare = Math.exp(-Math.pow(toMembrane / 0.32, 2));
  const ripple = smoothstep(MEMBRANE_DISTANCE, 0.15, toMembrane);
  return { q, cameraZ, toMembrane, membrane, flare, ripple };
}

/** Distance at which a w×h surface just covers a viewport (no edges visible). */
export function coverDistance(width: number, height: number, fovDeg: number, aspect: number, overscan = 0.97) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const byHeight = height / 2 / t;
  const byWidth = width / 2 / (t * aspect);
  return Math.min(byHeight, byWidth) * overscan;
}

/** Distance at which a w×h surface just fits inside the viewport. */
export function containDistance(width: number, height: number, fovDeg: number, aspect: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(height / 2 / t, width / 2 / (t * aspect));
}

/**
 * Camera pose during the field part of the passage.
 * @param start  where the camera was when the passage began
 * @param center centre of the selected slice
 * @param normal unit vector the slice faces (toward the observer)
 * @param cover  cover distance for the slice
 */
export function enterCameraPose(p: number, start: ObserverPose, center: Vec3, normal: Vec3, cover: number): ObserverPose {
  const phase = fieldPhase(p);
  const coverPosition = add(center, scale(normal, cover));
  return {
    position: mix3(start.position, coverPosition, phase.approach),
    target: mix3(start.target, center, easeInOutCubic(smoothstep(0, 0.42, p))),
  };
}

/** Ratio used by matchedEntrySlope. */
export const startRatio = (start: ObserverPose, center: Vec3, cover: number) =>
  Math.max(1, length(sub(start.position, center)) / cover);

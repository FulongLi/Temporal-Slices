import { labelForTime, momentBefore, timeSpan } from "./TemporalDataset";
import { clamp, smoothstep } from "./math";
import type { TemporalDataset } from "./types";

/**
 * Temporal sampling: how a few source moments become hundreds of slices.
 *
 * Slices are spaced evenly in *time*, so depth in the volume is proportional
 * to elapsed time. Each slice samples the two moments around it:
 *
 *   moment A ────── hold ──────┤ transition ├────── hold ────── moment B
 *   blend:           0          0 → 1 (smooth)           1
 *
 * Near a moment its image holds; between moments neighbouring slices
 * crossfade, so looking through the block shows one state turning into the
 * next. The renderer does the actual image mixing on the GPU.
 */

export interface SliceSampling {
  count: number;
  /** Time of each slice. */
  time: Float64Array;
  /** Moment indices sampled by each slice, and how far it has moved from A to B. */
  a: Uint16Array;
  b: Uint16Array;
  blend: Float32Array;
  /** Fractional slice position of each moment. */
  momentSlice: Float64Array;
}

/** Fraction of each interval between moments during which an image holds. */
export const DEFAULT_HOLD = 0.5;

export function sampleSlices(dataset: TemporalDataset, count: number, hold = DEFAULT_HOLD): SliceSampling {
  const { moments } = dataset;
  const span = timeSpan(dataset);
  const duration = span.end - span.start;
  const time = new Float64Array(count);
  const a = new Uint16Array(count);
  const b = new Uint16Array(count);
  const blend = new Float32Array(count);
  const edge = clamp(hold, 0, 0.98) / 2;
  for (let i = 0; i < count; i++) {
    const t = span.start + (duration * i) / (count - 1);
    time[i] = t;
    const k = Math.min(momentBefore(dataset, t), moments.length - 2);
    const local = (t - moments[k].time) / (moments[k + 1].time - moments[k].time);
    a[i] = k;
    b[i] = k + 1;
    blend[i] = smoothstep(edge, 1 - edge, local);
  }
  const momentSlice = Float64Array.from(moments, (m) => ((m.time - span.start) / duration) * (count - 1));
  return { count, time, a, b, blend, momentSlice };
}

/** Time at a fractional slice position. */
export function sliceTime(dataset: TemporalDataset, sampling: SliceSampling, s: number) {
  const span = timeSpan(dataset);
  return span.start + ((span.end - span.start) * clamp(s, 0, sampling.count - 1)) / (sampling.count - 1);
}

/** The moment a slice mostly shows. */
export function dominantMoment(sampling: SliceSampling, index: number) {
  const i = clamp(Math.round(index), 0, sampling.count - 1);
  return sampling.blend[i] < 0.5 ? sampling.a[i] : sampling.b[i];
}

/** Label for a fractional slice position (interpolated dates run like an odometer). */
export function sliceLabel(dataset: TemporalDataset, sampling: SliceSampling, s: number) {
  return labelForTime(dataset, sliceTime(dataset, sampling, s));
}

/** Nearest slice that shows moment `k` in full: the centre of its hold. */
export function sliceForMoment(sampling: SliceSampling, k: number) {
  const n = sampling.momentSlice.length;
  return Math.round(sampling.momentSlice[clamp(k, 0, n - 1)]);
}

/** Next (+1) or previous (-1) moment from a slice position, as a slice index. */
export function stepMoment(sampling: SliceSampling, from: number, direction: number) {
  const slices = sampling.momentSlice;
  if (direction > 0) {
    for (let k = 0; k < slices.length; k++) if (slices[k] > from + 0.5) return Math.round(slices[k]);
    return sampling.count - 1;
  }
  for (let k = slices.length - 1; k >= 0; k--) if (slices[k] < from - 0.5) return Math.round(slices[k]);
  return 0;
}

/** Fractional moment position of a slice position (2.5 = halfway from moment 2 to 3). */
export function momentPosition(sampling: SliceSampling, s: number) {
  const slices = sampling.momentSlice;
  const last = slices.length - 1;
  if (s <= slices[0]) return 0;
  if (s >= slices[last]) return last;
  let k = 0;
  while (k < last - 1 && slices[k + 1] <= s) k++;
  return k + (s - slices[k]) / (slices[k + 1] - slices[k]);
}

import { vec3, type Vec3 } from "./math";
import type { TemporalLayout } from "./TemporalLayout";

/**
 * Focus: extracting one moment from time.
 *
 * The chosen slice rises partly out of the block, like a card drawn from a
 * deck, drifts a little toward the observer's side and turns slightly to
 * face them, while the block opens a gap around it. The same functions
 * place the slice (through the volume shader's uniforms) and aim the
 * camera, so the two always agree.
 */

export const EXTRACT = {
  /** Sideways travel toward the observer's side, as a fraction of slice width. */
  side: 0.06,
  /** Rise out of the block, as a fraction of slice height. */
  lift: 0.34,
  /** Travel toward the front of the block (into the gap), world units. */
  forward: 0.42,
  /** Turn toward the observer, radians. */
  yaw: 0.16,
};

/**
 * The gap the block opens around a focused slice. Neighbours are pushed
 * away by `slices * e^(-|d| / reach)` slices, so the opening is widest next
 * to the focus and the layers beyond it are compressed against the rest.
 */
export const SEPARATION = { slices: 22, reach: 16 };

/** Extra scale when focused, and while being entered. */
export const FOCUS_GROW = 0.03;
export const ENTER_GROW = 0.06;

export interface SlicePose {
  position: Vec3;
  yaw: number;
  scale: number;
  /** Unit vector the surface faces. */
  normal: Vec3;
}

/**
 * @param focus 0 = resting in the block, 1 = fully extracted
 * @param grow  0..1 additional enlargement while entering
 */
export function slicePose(layout: TemporalLayout, index: number, focus: number, grow = 0): SlicePose {
  const yaw = EXTRACT.yaw * focus;
  return {
    position: vec3(
      EXTRACT.side * layout.sliceWidth * focus,
      EXTRACT.lift * layout.sliceHeight * focus,
      layout.sliceZ(index) + EXTRACT.forward * focus,
    ),
    yaw,
    scale: 1 + FOCUS_GROW * focus + ENTER_GROW * grow,
    normal: vec3(Math.sin(yaw), 0, Math.cos(yaw)),
  };
}

/** Displacement of slice `index`, in slices, while `focus` is extracted (mirrors the shader). */
export function separation(index: number, focus: number, amount: number) {
  const d = index - focus;
  if (d === 0) return 0;
  return Math.sign(d) * SEPARATION.slices * amount * Math.exp(-Math.abs(d) / SEPARATION.reach);
}

/** Whether a ray hits a slice standing at `pose` (a w×h rectangle facing `pose.normal`). */
export function rayHitsSlice(pose: SlicePose, width: number, height: number, origin: Vec3, dir: Vec3) {
  const n = pose.normal;
  const denom = n.x * dir.x + n.y * dir.y + n.z * dir.z;
  if (Math.abs(denom) < 1e-6) return false;
  const t = (n.x * (pose.position.x - origin.x) + n.y * (pose.position.y - origin.y) + n.z * (pose.position.z - origin.z)) / denom;
  if (t < 0) return false;
  const hx = origin.x + dir.x * t - pose.position.x;
  const hy = origin.y + dir.y * t - pose.position.y;
  const hz = origin.z + dir.z * t - pose.position.z;
  // Local axes: right = (cos yaw, 0, -sin yaw), up = +Y.
  const along = hx * Math.cos(pose.yaw) - hz * Math.sin(pose.yaw);
  return Math.abs(along) <= (width * pose.scale) / 2 && Math.abs(hy) <= (height * pose.scale) / 2;
}

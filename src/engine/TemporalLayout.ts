import { add, clamp, lerp, normalize, scale, vec3, type Vec3 } from "./math";
import { slicePose } from "./TemporalFocus";

/**
 * TemporalLayout decides where time exists in space.
 *
 * Phase 2 has a single arrangement: a *volume*. Hundreds of thin slices
 * stand parallel to the XY plane and are packed along Z, earliest at the
 * front (+Z) and latest at the back, so the whole archive forms one cuboid.
 * Slice positions are fractional so deformation, focus and travel can all
 * be expressed as offsets measured in slices.
 */

export interface ObserverPose {
  position: Vec3;
  target: Vec3;
}

/** Small adjustments to the resting view: pointer sway, drag and pinch. */
export interface ObserverOrbit {
  /** Extra yaw, radians. */
  yaw: number;
  /** Extra pitch, radians. */
  pitch: number;
  /** Distance multiplier; < 1 is closer. */
  zoom: number;
}

export const NO_ORBIT: ObserverOrbit = { yaw: 0, pitch: 0, zoom: 1 };

export interface VolumeOptions {
  /** Number of slices in the volume. */
  count: number;
  /** World distance between neighbouring slices. */
  spacing: number;
  /** World height of every slice; width follows the imagery's aspect. */
  height: number;
  aspect: number;
  /** Resting view: oblique angle onto the volume and distance from it. */
  view: { yaw: number; pitch: number; distance: number; ahead: number; follow: number };
  /** Examining one slice: distance and how far the view swings round. */
  focus: { distance: number; yaw: number; pitch: number; aim: number };
}

export interface TemporalLayout {
  readonly count: number;
  readonly spacing: number;
  readonly sliceWidth: number;
  readonly sliceHeight: number;
  /** Extent of the volume along its time axis. */
  readonly depth: number;
  /** Z of slice 0 (the earliest, frontmost slice). */
  readonly frontZ: number;
  /** Z of a fractional slice position. */
  sliceZ(s: number): number;
  /** Fractional slice position of a Z coordinate. */
  sliceAt(z: number): number;
  /** Where the observer stands when the present is at `cursor`. */
  observer(cursor: number, orbit?: ObserverOrbit): ObserverPose;
  /** Where the observer stands to examine one (extracted) slice. */
  focusObserver(index: number, orbit?: ObserverOrbit): ObserverPose;
}

export const DEFAULT_VOLUME: VolumeOptions = {
  count: 512,
  spacing: 0.032,
  height: 5,
  aspect: 1.6,
  view: { yaw: 0.66, pitch: 0.2, distance: 21, ahead: 3.2, follow: 0.78 },
  focus: { distance: 12.5, yaw: 0.5, pitch: 0.16, aim: 1.2 },
};

/** Unit vector for a yaw (about +Y, 0 = +Z) and a pitch (up). */
export function direction(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return vec3(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c);
}

export function createVolumeLayout(options: Partial<VolumeOptions> = {}): TemporalLayout {
  const o: VolumeOptions = {
    ...DEFAULT_VOLUME,
    ...options,
    view: { ...DEFAULT_VOLUME.view, ...options.view },
    focus: { ...DEFAULT_VOLUME.focus, ...options.focus },
  };
  const depth = (o.count - 1) * o.spacing;
  const frontZ = depth / 2;
  const sliceWidth = o.height * o.aspect;
  const sliceZ = (s: number) => frontZ - s * o.spacing;

  const layout: TemporalLayout = {
    count: o.count,
    spacing: o.spacing,
    sliceWidth,
    sliceHeight: o.height,
    depth,
    frontZ,
    sliceZ,
    sliceAt: (z) => (frontZ - z) / o.spacing,
    observer(cursor, orbit = NO_ORBIT) {
      // The gaze follows the present into the block, but keeps some of the
      // whole volume in view so it never stops reading as one object.
      const present = sliceZ(clamp(cursor, 0, o.count - 1));
      const z = lerp(0, present, o.view.follow) - o.view.ahead;
      const target = vec3(0, -0.05 * o.height, z);
      const eye = direction(o.view.yaw + orbit.yaw, o.view.pitch + orbit.pitch);
      return { position: add(target, scale(eye, o.view.distance * orbit.zoom)), target };
    },
    focusObserver(index, orbit = NO_ORBIT) {
      const pose = slicePose(layout, index, 1);
      const yaw = Math.atan2(pose.normal.x, pose.normal.z) + o.focus.yaw + orbit.yaw * 0.5;
      const eye = direction(yaw, o.focus.pitch + orbit.pitch * 0.5);
      // Aim a little to the left of the slice so it sits right of centre,
      // leaving the left of the frame for its date and title.
      const left = normalize(vec3(-eye.z, 0, eye.x));
      const target = add(pose.position, scale(left, -o.focus.aim));
      return { position: add(target, scale(eye, o.focus.distance * orbit.zoom)), target };
    },
  };
  return layout;
}

// ─── Picking ────────────────────────────────────────────────────────────

/**
 * The slice a ray points at: where the ray enters the visible part of the
 * volume (slices `from`..count-1). Entering through the front face picks
 * the present; entering through a side picks the slice at that depth.
 * Returns null when the ray misses or starts inside the volume.
 */
export function pickSlice(layout: TemporalLayout, origin: Vec3, dir: Vec3, from = 0): number | null {
  const first = clamp(from, 0, layout.count - 1);
  const min = vec3(-layout.sliceWidth / 2, -layout.sliceHeight / 2, layout.sliceZ(layout.count - 1));
  const max = vec3(layout.sliceWidth / 2, layout.sliceHeight / 2, layout.sliceZ(first));
  let enter = -Infinity;
  let exit = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    let t0 = (min[axis] - o) / d;
    let t1 = (max[axis] - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
  }
  if (enter > exit || enter < 0) return null;
  const z = origin.z + dir.z * enter;
  return clamp(Math.round(layout.sliceAt(z)), Math.ceil(first), layout.count - 1);
}

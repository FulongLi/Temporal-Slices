import { add, cross, normalize, scale, sub, vec3, type Vec3 } from "./math";

/**
 * TemporalLayout decides where every moment exists in space.
 *
 * A layout is a path through space parameterised by slice index: the slice
 * for index i stands on the path at i, facing back toward the past. The
 * observer (camera) is defined relative to the same path, so any path gives
 * a coherent field. The present position (a fractional index) is preserved
 * when switching layouts, so travelling and re-arranging are independent.
 */

export interface SlicePlacement {
  position: Vec3;
  /** Rotation about the vertical axis, radians. 0 faces +Z. */
  yaw: number;
}

export interface ObserverPose {
  position: Vec3;
  target: Vec3;
}

export interface TemporalLayout {
  readonly name: string;
  readonly label: string;
  /** World size of one slice. */
  readonly sliceWidth: number;
  readonly sliceHeight: number;
  readonly floorY: number;
  placement(index: number): SlicePlacement;
  /** Where the observer stands when the present is at `cursor`. */
  observer(cursor: number): ObserverPose;
  /** Where the observer stands to examine one slice. */
  focusObserver(index: number): ObserverPose;
}

export interface PathLayoutOptions {
  name: string;
  label: string;
  /** Point on the path for a fractional slice index. */
  path: (s: number) => Vec3;
  sliceWidth: number;
  sliceHeight: number;
  /** Slices turn slightly from the path normal toward the observer. */
  sliceYaw: number;
  observer: { back: number; side: number; height: number; ahead: number; targetSide: number; targetHeight: number };
  /** `aim` shifts the gaze sideways so the focused slice sits right of centre. */
  focus: { back: number; side: number; height: number; aim: number };
}

const UP = vec3(0, 1, 0);

export function createPathLayout(options: PathLayoutOptions): TemporalLayout {
  const { path } = options;
  const frame = (s: number) => {
    const point = path(s);
    const tangent = normalize(sub(path(s + 0.01), path(s - 0.01)));
    const right = normalize(cross(tangent, UP));
    return { point, tangent, right };
  };
  const offset = (s: number, along: number, side: number, height: number) => {
    const f = frame(s);
    return add(add(add(f.point, scale(f.tangent, along)), scale(f.right, side)), scale(UP, height));
  };
  const lowest = Math.min(...Array.from({ length: 64 }, (_, i) => path(i).y));
  return {
    name: options.name,
    label: options.label,
    sliceWidth: options.sliceWidth,
    sliceHeight: options.sliceHeight,
    floorY: lowest - options.sliceHeight / 2 - 0.32,
    placement(index) {
      const f = frame(index);
      return { position: f.point, yaw: Math.atan2(-f.tangent.x, -f.tangent.z) + options.sliceYaw };
    },
    observer(cursor) {
      const o = options.observer;
      return {
        position: offset(cursor, -o.back, o.side, o.height),
        target: offset(cursor, o.ahead, o.targetSide, o.targetHeight),
      };
    },
    focusObserver(index) {
      const o = options.focus;
      return { position: offset(index, -o.back, o.side, o.height), target: offset(index, 0, -o.aim, 0) };
    },
  };
}

const SLICE_HEIGHT = 1.5;
const SPACING = 1.15;

/** Straight time axis receding into depth, observed from slightly aside. */
export const corridorLayout = createPathLayout({
  name: "corridor",
  label: "Axis",
  path: (s) => vec3(0, 0, -s * SPACING),
  sliceWidth: SLICE_HEIGHT * 1.6,
  sliceHeight: SLICE_HEIGHT,
  sliceYaw: -0.38,
  observer: { back: 3.1, side: -2.0, height: 0.45, ahead: 2.0, targetSide: 0.85, targetHeight: -0.05 },
  focus: { back: 3.3, side: -1.8, height: 0.14, aim: 0.22 },
});

/** The same moments carried on a slow meander, like a river of time. */
export const driftLayout = createPathLayout({
  name: "drift",
  label: "Drift",
  path: (s) => vec3(Math.sin(s * 0.19) * 2.4, Math.sin(s * 0.11 + 1) * 0.22, -s * SPACING * 1.08),
  sliceWidth: SLICE_HEIGHT * 1.6,
  sliceHeight: SLICE_HEIGHT,
  sliceYaw: -0.3,
  observer: { back: 3.3, side: -2.0, height: 0.55, ahead: 2.2, targetSide: 0.8, targetHeight: -0.05 },
  focus: { back: 3.3, side: -1.8, height: 0.14, aim: 0.22 },
});

export const LAYOUTS: TemporalLayout[] = [corridorLayout, driftLayout];

/** Rescale a layout's slices for imagery of a different aspect ratio. */
export function layoutForAspect(layout: TemporalLayout, aspect: number): TemporalLayout {
  return { ...layout, sliceWidth: layout.sliceHeight * aspect };
}

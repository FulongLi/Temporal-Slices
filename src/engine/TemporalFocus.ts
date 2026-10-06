import { add, lerp, normalize, scale, vec3, type Vec3 } from "./math";
import type { SlicePlacement, TemporalLayout } from "./TemporalLayout";

/**
 * How a slice presents itself when examined: it turns to face the observer,
 * moves a little toward them and grows slightly. The same function places
 * the slice and aims the camera, so the two always agree.
 */

/** Distance a focused slice moves toward the observer. */
export const FOCUS_LIFT = 0.4;
/** Extra scale when focused, and while being entered. */
export const FOCUS_GROW = 0.04;
export const ENTER_GROW = 0.08;

export interface SlicePose {
  position: Vec3;
  yaw: number;
  scale: number;
  /** Unit vector the surface faces. */
  normal: Vec3;
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * @param focus 0 = resting in the field, 1 = fully presented
 * @param grow  0..1 additional enlargement while entering
 */
export function slicePose(layout: TemporalLayout, index: number, base: SlicePlacement, focus: number, grow = 0): SlicePose {
  const eye = layout.focusObserver(index).position;
  const toward = normalize(vec3(eye.x - base.position.x, 0, eye.z - base.position.z));
  const faceYaw = Math.atan2(toward.x, toward.z);
  const yaw = lerpAngle(base.yaw, faceYaw, focus);
  return {
    position: add(base.position, scale(toward, FOCUS_LIFT * focus)),
    yaw,
    scale: 1 + FOCUS_GROW * focus + ENTER_GROW * grow,
    normal: vec3(Math.sin(yaw), 0, Math.cos(yaw)),
  };
}

export const mixPlacement = (a: SlicePlacement, b: SlicePlacement, t: number): SlicePlacement => ({
  position: vec3(lerp(a.position.x, b.position.x, t), lerp(a.position.y, b.position.y, t), lerp(a.position.z, b.position.z, t)),
  yaw: lerpAngle(a.yaw, b.yaw, t),
});

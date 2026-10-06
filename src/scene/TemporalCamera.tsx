import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PerspectiveCamera } from "three";
import {
  clamp,
  coverDistance,
  damp,
  enterCameraPose,
  matchedEntrySlope,
  mix3,
  momentPhase,
  slicePose,
  smoothstep,
  Spring,
  startRatio,
  SWAP_POINT,
  vec3,
  type ObserverPose,
} from "../engine";
import { MOMENT_ORIGIN } from "./constants";
import { useRuntime } from "./runtime";

const copyPose = (pose: ObserverPose): ObserverPose => ({ position: { ...pose.position }, target: { ...pose.target } });

/**
 * The observer. While browsing it follows the layout's observer pose for the
 * present position, eases toward a focused slice, and sways slightly with
 * the pointer, as if standing. During the passage it follows the engine's
 * transition path exactly, so the change of space at the swap is seamless.
 */
export function TemporalCamera() {
  const runtime = useRuntime();
  const pose = useRef<ObserverPose | null>(null);
  const focus = useRef(new Spring(0, 4.2, 1));
  const inside = useRef(0);
  const parallax = useRef({ x: 0, y: 0 });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const camera = state.camera as PerspectiveCamera;
    const s = runtime.store.getState();
    const layout = runtime.layout();
    const nav = runtime.navigation;
    const T = runtime.transition;
    const reduced = runtime.reducedMotion;
    const aspect = state.size.width / Math.max(1, state.size.height);

    parallax.current.x = damp(parallax.current.x, reduced ? 0 : runtime.pointer.x, 2.5, dt);
    parallax.current.y = damp(parallax.current.y, reduced ? 0 : runtime.pointer.y, 2.5, dt);
    const px = parallax.current.x;
    const py = parallax.current.y;

    // Where a browsing observer wants to be.
    const focusIndex = s.focus;
    const focusAmount = clamp(focus.current.update(focusIndex !== null && s.mode !== "observe" ? 1 : 0, dt));
    let desired = layout.observer(nav.position);
    if (focusIndex !== null) {
      const f = layout.focusObserver(focusIndex);
      desired = { position: mix3(desired.position, f.position, focusAmount), target: mix3(desired.target, f.target, focusAmount) };
    }
    // Narrow or portrait viewports step back along the line of sight so the field still fits.
    const fit = clamp(1.5 / aspect, 1, 2.6);
    if (fit > 1) desired.position = mix3(desired.target, desired.position, fit);
    const sway = reduced ? 0 : Math.sin(runtime.clock * 0.21) * 0.035;
    desired.position.x += px * 0.22 + sway;
    desired.position.y += py * 0.12 + Math.sin(runtime.clock * 0.17) * (reduced ? 0 : 0.02);

    if (!pose.current) pose.current = copyPose(desired);
    const current = pose.current;
    const passage = T.progress > 0 || s.mode === "entering";
    runtime.frame.flare = 0;
    runtime.frame.distort = 0;
    runtime.frame.speed = Math.abs(nav.velocity);

    if (!passage || focusIndex === null) {
      T.start = null;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
      current.position = mix3(current.position, desired.position, k);
      current.target = mix3(current.target, desired.target, k);
      camera.position.set(current.position.x, current.position.y, current.position.z);
      camera.lookAt(current.target.x, current.target.y, current.target.z);
      return;
    }

    // The passage. Its start is the pose at the moment Enter was pressed.
    if (!T.start) T.start = copyPose(current);
    const slice = slicePose(layout, focusIndex, runtime.placements[focusIndex], 1, 1);
    T.center = slice.position;
    T.normal = slice.normal;
    T.sliceScale = slice.scale;
    T.cover = coverDistance(layout.sliceWidth * slice.scale, layout.sliceHeight * slice.scale, camera.fov, aspect);
    T.entrySlope = matchedEntrySlope(startRatio(T.start, T.center, T.cover));
    runtime.frame.distort = smoothstep(0.2, SWAP_POINT, T.progress);

    if (T.progress < SWAP_POINT) {
      const p = enterCameraPose(T.progress, T.start, T.center, T.normal, T.cover);
      camera.position.set(p.position.x, p.position.y, p.position.z);
      camera.lookAt(p.target.x, p.target.y, p.target.z);
      return;
    }

    // Inside the moment: continue through the membrane, then stand and look.
    const m = momentPhase(T.progress, T.entrySlope);
    runtime.frame.flare = m.flare;
    inside.current = damp(inside.current, s.mode === "inside" ? 1 : 0, 1.6, dt);
    const look = inside.current * (reduced ? 0 : 1);
    const drift = vec3(px * 0.34 * look + Math.sin(runtime.clock * 0.23) * 0.05 * look, py * 0.16 * look, 0);
    camera.position.set(MOMENT_ORIGIN.x + drift.x, MOMENT_ORIGIN.y + drift.y, MOMENT_ORIGIN.z + m.cameraZ);
    camera.lookAt(MOMENT_ORIGIN.x + px * 0.4 * look, MOMENT_ORIGIN.y + py * 0.2 * look, MOMENT_ORIGIN.z - 40);
  }, -2);

  return null;
}

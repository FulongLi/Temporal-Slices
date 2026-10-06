import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PerspectiveCamera } from "three";
import {
  clamp,
  coverDistance,
  damp,
  easeInOutCubic,
  enterCameraPose,
  lerp,
  matchedEntrySlope,
  mix3,
  momentPhase,
  slicePose,
  smoothstep,
  Spring,
  startRatio,
  SWAP_POINT,
  vec3,
  type ObserverOrbit,
  type ObserverPose,
} from "../engine";
import { MOMENT_ORIGIN } from "./constants";
import { useRuntime } from "./runtime";

const copyPose = (pose: ObserverPose): ObserverPose => ({ position: { ...pose.position }, target: { ...pose.target } });

/**
 * The observer. It arrives from far away while the volume assembles, then
 * rests at an oblique angle so the block's thickness is always visible,
 * follows the present through time, and swings round to face an extracted
 * slice. Pointer, drag and pinch only lean the view a little. During the
 * passage it follows the engine's transition path exactly, so the change
 * of space at the swap is seamless.
 */
export function TemporalCamera() {
  const runtime = useRuntime();
  const pose = useRef<ObserverPose | null>(null);
  const focus = useRef(new Spring(0, 3.2, 1));
  const inside = useRef(0);
  const orbit = useRef<ObserverOrbit>({ yaw: 0, pitch: 0, zoom: 1 });
  const parallax = useRef({ x: 0, y: 0 });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const camera = state.camera as PerspectiveCamera;
    const s = runtime.store.getState();
    const { layout, navigation: nav, transition: T, reducedMotion: reduced } = runtime;
    const aspect = state.size.width / Math.max(1, state.size.height);

    const p = parallax.current;
    p.x = damp(p.x, reduced || !runtime.pointer.inside ? 0 : runtime.pointer.x, 1.8, dt);
    p.y = damp(p.y, reduced || !runtime.pointer.inside ? 0 : runtime.pointer.y, 1.8, dt);

    // Inspection: drag and pinch set a target; the view eases toward it,
    // and the pointer leans it very slightly, as if the observer shifted weight.
    const o = orbit.current;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3);
    o.yaw = lerp(o.yaw, runtime.orbit.yaw, k);
    o.pitch = lerp(o.pitch, runtime.orbit.pitch, k);
    o.zoom = lerp(o.zoom, runtime.orbit.zoom, k);
    // Arrival: from far away, slightly round to the side, gliding in.
    const arrive = 1 - easeInOutCubic(smoothstep(0.05, 1, runtime.intro));
    const view: ObserverOrbit = {
      yaw: o.yaw + p.x * 0.07 + arrive * 0.35 + (reduced ? 0 : Math.sin(runtime.clock * 0.07) * 0.025),
      pitch: o.pitch - p.y * 0.04 + arrive * 0.12,
      zoom: o.zoom * (1 + arrive * 1.6),
    };

    const focusIndex = s.focus;
    const focusAmount = clamp(focus.current.update(focusIndex !== null && s.mode !== "observe" ? 1 : 0, dt));
    let desired = layout.observer(nav.position, view);
    if (focusIndex !== null) {
      const f = layout.focusObserver(focusIndex, view);
      const t = easeInOutCubic(focusAmount);
      desired = { position: mix3(desired.position, f.position, t), target: mix3(desired.target, f.target, t) };
    }
    // Narrow or portrait viewports step back along the line of sight so the block still fits.
    const fit = clamp(1.6 / aspect, 1, 2.6);
    if (fit > 1) desired.position = mix3(desired.target, desired.position, fit);

    if (!pose.current) pose.current = copyPose(desired);
    const current = pose.current;
    const passage = T.progress > 0 || s.mode === "entering";
    runtime.frame.flare = 0;
    runtime.frame.distort = 0;

    if (!passage || focusIndex === null) {
      T.start = null;
      const ease = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
      current.position = mix3(current.position, desired.position, ease);
      current.target = mix3(current.target, desired.target, ease);
      camera.position.set(current.position.x, current.position.y, current.position.z);
      camera.lookAt(current.target.x, current.target.y, current.target.z);
      return;
    }

    // The passage. Its start is the pose at the moment Enter was pressed.
    if (!T.start) T.start = copyPose(current);
    const slice = slicePose(layout, focusIndex, 1, 1);
    T.center = slice.position;
    T.normal = slice.normal;
    T.sliceScale = slice.scale;
    T.cover = coverDistance(layout.sliceWidth * slice.scale, layout.sliceHeight * slice.scale, camera.fov, aspect);
    T.entrySlope = matchedEntrySlope(startRatio(T.start, T.center, T.cover));
    runtime.frame.distort = smoothstep(0.2, SWAP_POINT, T.progress);

    if (T.progress < SWAP_POINT) {
      const path = enterCameraPose(T.progress, T.start, T.center, T.normal, T.cover);
      camera.position.set(path.position.x, path.position.y, path.position.z);
      camera.lookAt(path.target.x, path.target.y, path.target.z);
      return;
    }

    // Inside the moment: continue through the membrane, then stand and look.
    const m = momentPhase(T.progress, T.entrySlope);
    runtime.frame.flare = m.flare;
    inside.current = damp(inside.current, s.mode === "inside" ? 1 : 0, 1.6, dt);
    const look = inside.current * (reduced ? 0 : 1);
    const drift = vec3(p.x * 0.34 * look + Math.sin(runtime.clock * 0.23) * 0.05 * look, p.y * 0.16 * look, 0);
    camera.position.set(MOMENT_ORIGIN.x + drift.x, MOMENT_ORIGIN.y + drift.y, MOMENT_ORIGIN.z + m.cameraZ);
    camera.lookAt(MOMENT_ORIGIN.x + p.x * 0.4 * look, MOMENT_ORIGIN.y + p.y * 0.2 * look, MOMENT_ORIGIN.z - 40);
  }, -2);

  return null;
}

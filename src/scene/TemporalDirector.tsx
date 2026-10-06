import { useFrame } from "@react-three/fiber";
import { advanceProgress } from "../engine";
import { useRuntime } from "./runtime";

/**
 * Advances the engine once per frame, before anything is drawn:
 * travel along the time axis, the Enter Slice timeline, and texture streaming.
 */
export function TemporalDirector() {
  const runtime = useRuntime();
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { store, navigation, transition, textures } = runtime;
    runtime.clock += dt;

    const s = store.getState();
    if (s.mode === "observe" || s.mode === "focus") navigation.update(dt);
    if (navigation.present !== s.present) store.dispatch({ type: "present", index: navigation.present });

    const inward = s.mode === "entering" || s.mode === "inside";
    transition.progress = advanceProgress(transition.progress, inward, dt, runtime.timing);
    if (s.mode === "entering" && transition.progress >= 1) store.dispatch({ type: "entered" });
    if (s.mode === "exiting" && transition.progress <= 0) store.dispatch({ type: "exited" });

    textures.update(performance.now());
  }, -3);
  return null;
}

import { useFrame } from "@react-three/fiber";
import { advanceProgress, clamp, computeLOD, fieldPhase, momentPosition } from "../engine";
import { useRuntime } from "./runtime";

/** Seconds for the volume to assemble and the observer to arrive. */
const INTRO_SECONDS = 4.2;
/** Focus moving this many slices or fewer slides the extracted slice along instead of swapping it. */
const SCRUB_REACH = 3;

/**
 * Advances the engine once per frame, before anything is drawn: travel
 * through time, focus extraction, the volume's waves, the Enter Slice
 * timeline and texture streaming.
 */
export function TemporalDirector() {
  const runtime = useRuntime();
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { store, navigation, transition, textures, waves, focus } = runtime;
    runtime.clock += dt;
    runtime.intro = clamp(runtime.intro + dt / INTRO_SECONDS);

    const s = store.getState();
    const browsing = s.mode === "observe" || s.mode === "focus";
    if (browsing) navigation.update(dt);
    if (navigation.present !== s.present) store.dispatch({ type: "present", index: navigation.present });
    runtime.frame.speed = Math.abs(navigation.velocity);
    runtime.frame.travel = runtime.reducedMotion ? 0 : Math.tanh(navigation.velocity / 70);

    // Focus: extract the chosen slice; a nearby change slides the extracted
    // slice through time, a distant one sends the old slice back first.
    const want = s.focus !== null && s.mode !== "observe" ? s.focus : -1;
    const cur = focus.current;
    if (want >= 0 && want !== cur.index) {
      if (cur.index >= 0 && Math.abs(want - cur.index) <= SCRUB_REACH && cur.amount > 0.3) {
        cur.index = want;
      } else {
        focus.current = focus.previous;
        focus.previous = cur;
        focus.current.index = want;
        focus.current.spring.settle(0);
        if (!runtime.reducedMotion) waves.launchFrom(want);
      }
    }
    const active = focus.current;
    const passage = transition.progress > 0 || s.mode === "entering";
    let amount = active.spring.update(want >= 0 ? 1 : 0, dt);
    if (runtime.reducedMotion) active.spring.settle((amount = want >= 0 ? 1 : 0));
    if (passage && want >= 0) amount = Math.max(amount, fieldPhase(transition.progress).lift);
    active.amount = clamp(amount);
    if (active.amount < 0.001 && want < 0) active.index = -1;
    const prev = focus.previous;
    prev.amount = clamp(prev.spring.update(0, dt));
    if (prev.amount < 0.001) prev.index = -1;

    waves.update(dt, !runtime.reducedMotion && browsing);

    const inward = s.mode === "entering" || s.mode === "inside";
    transition.progress = advanceProgress(transition.progress, inward, dt, runtime.timing);
    if (s.mode === "entering" && transition.progress >= 1) store.dispatch({ type: "entered" });
    if (s.mode === "exiting" && transition.progress <= 0) store.dispatch({ type: "exited" });

    // Full-resolution imagery for the moments the focused slice is made of,
    // and, once travel settles, for the moments around the present.
    const now = performance.now();
    if (active.index >= 0 && want >= 0) {
      textures.wantHigh(runtime.sampling.a[active.index], now);
      textures.wantHigh(runtime.sampling.b[active.index], now);
    } else if (browsing && runtime.frame.speed < 1) {
      const present = momentPosition(runtime.sampling, navigation.position);
      for (let k = 0; k < runtime.dataset.moments.length; k++) {
        if (computeLOD(k - present).wantsHighRes) textures.wantHigh(k, now);
      }
    }
    textures.update(now);
  }, -3);
  return null;
}

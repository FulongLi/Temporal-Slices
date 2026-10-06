import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { NoToneMapping } from "three";
import { RuntimeContext, type TemporalRuntime } from "./runtime";
import { BACKGROUND, FOG_DENSITY, FOV } from "./constants";
import { TemporalCamera } from "./TemporalCamera";
import { TemporalDirector } from "./TemporalDirector";
import { TemporalEffects } from "./TemporalEffects";
import { TemporalEnvironment } from "./TemporalEnvironment";
import { TemporalMoment } from "./TemporalMoment";
import { TemporalVolume } from "../volume/TemporalVolume";

/** The WebGL stage: the volume, the moment inside a slice, the observer and light. */
export function TemporalScene({ runtime }: { runtime: TemporalRuntime }) {
  // Resolution adapts to the device: drop pixel ratio when frames fall short.
  // Hundreds of blended layers make the volume fill-bound, so start at 1.5.
  const [dpr, setDpr] = useState(Math.min(1.5, window.devicePixelRatio || 1));
  return (
    <Canvas
      className="temporal-canvas"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: NoToneMapping }}
      camera={{ fov: FOV, near: 0.05, far: 220, position: [30, 8, 40] }}
      aria-label={`${runtime.dataset.title}: temporal volume`}
      onCreated={(state) => {
        // Handy for profiling from the devtools console.
        if (import.meta.env.DEV) (window as unknown as { r3f: unknown }).r3f = state;
      }}
    >
      <RuntimeContext.Provider value={runtime}>
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(1.5, window.devicePixelRatio || 1, d + 0.25))}
        />
        <color attach="background" args={[BACKGROUND]} />
        <fogExp2 attach="fog" args={[BACKGROUND, FOG_DENSITY]} />
        <TemporalDirector />
        <TemporalCamera />
        <TemporalEnvironment />
        <TemporalVolume />
        <TemporalMoment />
        <TemporalEffects />
      </RuntimeContext.Provider>
    </Canvas>
  );
}

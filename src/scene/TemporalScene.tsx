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
import { TemporalField } from "./TemporalField";
import { TemporalMoment } from "./TemporalMoment";

/** The WebGL stage: field, moment, observer and light. */
export function TemporalScene({ runtime }: { runtime: TemporalRuntime }) {
  // Resolution adapts to the device: drop pixel ratio when frames fall short.
  const [dpr, setDpr] = useState(Math.min(1.75, window.devicePixelRatio || 1));
  return (
    <Canvas
      className="temporal-canvas"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: NoToneMapping }}
      camera={{ fov: FOV, near: 0.05, far: 140, position: [-2, 0.5, 3] }}
      onPointerMissed={() => {
        if (runtime.store.getState().mode === "focus") runtime.store.dispatch({ type: "escape" });
      }}
      aria-label={`${runtime.dataset.title}: temporal field`}
    >
      <RuntimeContext.Provider value={runtime}>
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(1.75, window.devicePixelRatio || 1, d + 0.25))}
        />
        <color attach="background" args={[BACKGROUND]} />
        <fogExp2 attach="fog" args={[BACKGROUND, FOG_DENSITY]} />
        <TemporalDirector />
        <TemporalCamera />
        <TemporalEnvironment />
        <TemporalField />
        <TemporalMoment />
        <TemporalEffects />
      </RuntimeContext.Provider>
    </Canvas>
  );
}

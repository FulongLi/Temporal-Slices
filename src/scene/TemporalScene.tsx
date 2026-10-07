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
import { TemporalCaustics } from "../volume/TemporalCaustics";
import { TemporalVolume } from "../volume/TemporalVolume";
import { stepQuality } from "../volume/SpectralLook";

/** The WebGL stage: the volume, the moment inside a slice, the observer and light. */
export function TemporalScene({ runtime }: { runtime: TemporalRuntime }) {
  // Resolution adapts to the device: drop pixel ratio when frames fall short.
  // Hundreds of blended layers make the volume fill-bound, so start at 1.5.
  const [dpr, setDpr] = useState(Math.min(1.5, window.devicePixelRatio || 1));
  const [requested] = useState(runtime.quality);
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
          // Resolution goes first; once at DPR 1, the optics step down
          // (high → medium → low), and come back before resolution does.
          onDecline={() => {
            if (dpr > 1) setDpr(Math.max(1, dpr - 0.25));
            else runtime.quality = stepQuality(runtime.quality, -1);
          }}
          onIncline={() => {
            if (runtime.quality !== requested) runtime.quality = stepQuality(runtime.quality, 1);
            else setDpr(Math.min(1.5, window.devicePixelRatio || 1, dpr + 0.25));
          }}
          // If it keeps flip-flopping, settle on a safe middle.
          flipflops={6}
          onFallback={() => {
            setDpr(1);
            runtime.quality = stepQuality(requested, -1);
          }}
        />
        <color attach="background" args={[BACKGROUND]} />
        <fogExp2 attach="fog" args={[BACKGROUND, FOG_DENSITY]} />
        <TemporalDirector />
        <TemporalCamera />
        <TemporalEnvironment />
        <TemporalCaustics />
        <TemporalVolume />
        <TemporalMoment />
        <TemporalEffects />
      </RuntimeContext.Provider>
    </Canvas>
  );
}

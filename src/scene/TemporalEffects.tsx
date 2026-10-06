import { useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode, type BloomEffect, type ChromaticAberrationEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import { Vector2 } from "three";
import { damp } from "../engine";
import { useRuntime } from "./runtime";

/**
 * Light treatment: restrained bloom on edges and lights, a little film
 * grain and vignette, and chromatic separation that appears only while
 * travelling fast or passing through a membrane.
 */
export function TemporalEffects() {
  const runtime = useRuntime();
  const bloom = useRef<BloomEffect>(null);
  const aberration = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new Vector2(0, 0), []);
  const level = useRef(0);

  useFrame((_, dt) => {
    const f = runtime.frame;
    const target = runtime.reducedMotion ? 0 : f.flare * 0.0045 + f.distort * 0.0012 + Math.min(f.speed, 6) * 0.00022;
    level.current = damp(level.current, target, 8, Math.min(dt, 0.1));
    offset.set(level.current, level.current * 0.6);
    if (aberration.current) aberration.current.offset = offset;
    if (bloom.current) bloom.current.intensity = 0.9 + f.flare * 1.8;
  });

  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloom} mipmapBlur intensity={0.9} luminanceThreshold={0.42} luminanceSmoothing={0.3} radius={0.72} />
      <ChromaticAberration ref={aberration} offset={offset} radialModulation modulationOffset={0.35} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.22} darkness={0.82} />
      <Noise premultiply opacity={0.55} blendFunction={BlendFunction.SCREEN} />
    </EffectComposer>
  );
}

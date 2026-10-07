import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode, type BloomEffect } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import { damp } from "../engine";
import { SPECTRAL_LOOK } from "../volume/SpectralLook";
import { useRuntime } from "./runtime";
import { SpectralBoundaryEffect } from "./SpectralBoundaryEffect";

/**
 * Light treatment: restrained bloom on edges and lights, a little film
 * grain and vignette, and the spectral boundary: wavelengths that separate
 * only while travelling fast or passing through a membrane, and the
 * interference field of the passage itself.
 */
export function TemporalEffects() {
  const runtime = useRuntime();
  const bloom = useRef<BloomEffect>(null);
  const spectral = useMemo(() => new SpectralBoundaryEffect(), []);
  useEffect(() => () => spectral.dispose(), [spectral]);
  const level = useRef(0);

  useFrame((_, dt) => {
    const f = runtime.frame;
    const o = f.optics;
    const L = SPECTRAL_LOOK;
    const target = runtime.reducedMotion
      ? 0
      : L.dispersion * (o.dispersion * 0.006 * L.enterBoost + o.interference * 0.008 * L.enterBoost + Math.abs(f.travel) * 0.003);
    level.current = damp(level.current, target, 8, Math.min(dt, 0.1));
    spectral.set(level.current, o.interference * L.enterBoost, runtime.clock);
    // The crossing glows, but stays coloured rather than flashing white.
    if (bloom.current) bloom.current.intensity = 0.75 + o.interference * 0.6;
  });

  return (
    // No MSAA: hundreds of blended layers would pay for it per sample, and
    // the membranes' edges are antialiased in the shader.
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur intensity={0.75} luminanceThreshold={0.5} luminanceSmoothing={0.35} radius={0.75} />
      <primitive object={spectral} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.22} darkness={0.82} />
      <Noise premultiply opacity={0.4} blendFunction={BlendFunction.SCREEN} />
    </EffectComposer>
  );
}

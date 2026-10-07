import { Effect, EffectAttribute } from "postprocessing";
import { Uniform } from "three";
import fragmentShader from "../shaders/spectral-boundary.frag.glsl?raw";
import { SPECTRAL_LOOK, withSpectral } from "../volume/SpectralLook";

/**
 * Screen-space spectral separation and the interference field of the
 * Enter Slice passage (see spectral-boundary.frag.glsl). Inactive, it
 * passes the image through untouched.
 */
export class SpectralBoundaryEffect extends Effect {
  constructor() {
    super("SpectralBoundaryEffect", withSpectral(fragmentShader), {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["uDispersion", new Uniform(0)],
        ["uInterference", new Uniform(0)],
        ["uWarmth", new Uniform(SPECTRAL_LOOK.warmAccent)],
        ["uClock", new Uniform(0)],
      ]),
    });
  }

  set(dispersion: number, interference: number, clock: number) {
    this.uniforms.get("uDispersion")!.value = dispersion;
    this.uniforms.get("uInterference")!.value = interference;
    this.uniforms.get("uClock")!.value = clock;
  }
}

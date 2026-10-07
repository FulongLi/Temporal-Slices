// Light the volume lets through, landing in the dark beneath it. Never a
// floor: no surface, no edge, no grid, only a faint caustic glow that
// spills a little beyond the block's footprint and gathers under the
// slices a wave is passing, or under an extracted slice. Additive.

#include <spectral>

uniform float uTime;
uniform vec4 uWaves[4];      // position, strength, width, direction (slices)
uniform vec4 uFootprint;     // half width, front z, back z, slice spacing
uniform vec2 uFocus;         // slice index, amount
uniform float uStrength;
uniform float uWarmth;
uniform float uFogDensity;

in vec3 vWorld;
in float vDepth;
out vec4 fragColor;

void main() {
  vec2 p = vWorld.xz;
  float zc = 0.5 * (uFootprint.y + uFootprint.z);
  vec2 extent = vec2(uFootprint.x, 0.5 * (uFootprint.y - uFootprint.z));
  vec2 outside = max(abs(vec2(p.x, p.y - zc)) - extent, 0.0);
  float mask = exp(-dot(outside, outside) / 1.6);

  float s = (uFootprint.y - p.y) / uFootprint.w;   // the slice overhead
  float wave = 0.0;
  for (int k = 0; k < 4; k++) {
    vec4 w = uWaves[k];
    if (w.y <= 0.0) continue;
    float x = (s - w.x) / w.z;
    wave += w.y * exp(-x * x);
  }
  float carried = 1.0 - exp(-wave * 0.45);
  float focus = uFocus.y * exp(-abs(s - uFocus.x) / 24.0);
  float energy = 0.1 + carried * 1.3 + focus;

  float c = causticField(p * 1.15, uTime * 0.13 + s * 0.02 + carried * 0.6);
  vec3 tone = spectralPalette(0.3 + s * 0.0011 + c * 0.12 + carried * 0.2, uWarmth);
  float fog = exp(-pow(uFogDensity * vDepth, 2.0));
  fragColor = vec4(tone * c * mask * energy * uStrength * fog, 0.0);
}

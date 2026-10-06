// Drifting motes in a box that wraps around the observer, so the field
// always has particles to move past: the most direct cue of travel.
attribute float aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uPixelRatio;
uniform float uFogDensity;
uniform float uSize;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.y += uTime * 0.003 * (0.4 + aSeed);
  p.x += sin(uTime * 0.05 + aSeed * 40.0) * 0.01;
  vec3 local = (fract(p - uCenter / uBox) - 0.5) * uBox;
  vec4 view = viewMatrix * vec4(uCenter + local, 1.0);
  gl_Position = projectionMatrix * view;
  float depth = -view.z;
  gl_PointSize = uPixelRatio * uSize * (0.6 + aSeed * 1.6) * (6.0 / max(depth, 0.4));
  float twinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 1.8) + aSeed * 90.0);
  vAlpha = (0.2 + 0.8 * aSeed * aSeed) * twinkle
    * exp(-pow(uFogDensity * depth, 2.0))
    * smoothstep(0.25, 1.4, depth);
}

// Temporal slice surface. One continuous function of `uDetail` covers the
// three levels of disclosure:
//   far  (0)   a faint luminous film, an edge line, a vague silhouette
//   mid  (0.5) a cold, blurred memory of the image
//   near (1)   the moment itself, in colour and in full resolution
// Output is premultiplied so edges can glow without occluding.

uniform sampler2D uMapLow;
uniform sampler2D uMapHigh;
uniform float uLowReady;
uniform float uHigh;
uniform float uDetail;
uniform float uFocus;
uniform float uHover;
uniform float uDim;
uniform float uVisibility;
uniform float uFlare;
uniform float uTime;
uniform float uFogDensity;
uniform float uFloorY;
uniform vec3 uTint;
uniform vec2 uSize;

varying vec2 vUv;
varying vec3 vWorld;
varying float vDepth;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  float seen = max(uDetail, uFocus);
  float clarity = smoothstep(0.55, 0.97, seen);
  float presence = smoothstep(0.1, 0.62, seen);

  // Distance blurs the image (mip bias) before it disappears.
  float blur = mix(5.0, 0.0, smoothstep(0.2, 0.92, seen));
  vec3 low = texture2D(uMapLow, uv, blur).rgb;
  vec3 high = texture2D(uMapHigh, uv).rgb;
  vec3 img = mix(low, high, uHigh * clarity);
  float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));

  vec3 glow = mix(vec3(0.56, 0.76, 1.0), uTint, 0.28);
  vec3 ghost = glow * lum * 1.7;
  vec3 surface = mix(ghost, img, clarity) * uLowReady * presence;

  // Far away only the brightest structure survives, as a silhouette.
  float silhouette = smoothstep(0.06, 0.28, lum) * (1.0 - presence) * uLowReady;

  // Temporal interference: faint scan lines on anything not fully seen.
  float scan = 0.5 + 0.5 * sin(uv.y * uSize.y * 240.0 - uTime * 0.7);
  surface *= 1.0 - (1.0 - clarity) * (0.1 + 0.14 * scan);
  surface *= 1.0 + 0.14 * uHover;

  float alpha = mix(0.035, 0.95, smoothstep(0.12, 0.95, uDetail));
  alpha = mix(alpha, 1.0, uFocus);
  vec3 rgb = surface * alpha + glow * silhouette * 0.09;
  alpha = max(alpha, silhouette * 0.06);

  // Edge: a constant-width hairline in screen space plus a soft halo.
  vec2 edge2 = min(uv, 1.0 - uv) * uSize;
  float e = min(edge2.x, edge2.y);
  float hairline = 1.0 - smoothstep(0.0, max(fwidth(e) * 1.6, 0.004), e);
  float halo = exp(-e * 10.0);
  float edgeStrength = mix(0.45, 0.85, 1.0 - presence) + 0.9 * uHover + 1.0 * uFocus;
  rgb += glow * (hairline * edgeStrength + halo * (0.025 + 0.06 * uHover + 0.05 * uFocus));
  rgb += glow * uFlare * 0.9;
  rgb += (hash(uv * 640.0 + fract(uTime)) - 0.5) * 0.02 * (1.0 - clarity) * presence;

  // Focus elsewhere darkens this slice; distance fogs it; time fades it.
  float fog = exp(-pow(uFogDensity * vDepth, 2.0));
  float k = uVisibility * fog;
  rgb *= (1.0 - uDim * 0.84) * k;
  alpha *= (1.0 - uDim * 0.45) * k;

  // Mirrored copy below the floor becomes a faint reflection.
  float below = step(vWorld.y, uFloorY);
  float reflection = mix(1.0, 0.2 * exp(-(uFloorY - vWorld.y) * 1.7), below);
  rgb *= reflection;
  alpha *= reflection;

  gl_FragColor = vec4(rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

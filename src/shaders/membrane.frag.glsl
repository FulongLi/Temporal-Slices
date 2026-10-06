// Mirrors the focused slice of the volume (fully resolved, opaque) so the
// change of space at the swap is invisible, then flares and opens as the
// camera passes through it.

precision highp sampler2DArray;

uniform sampler2DArray uImages;
uniform sampler2D uHighA;
uniform sampler2D uHighB;
uniform float uHighReady;
uniform vec3 uImage;       // moment A, moment B, blend
uniform float uVisibility;
uniform float uFlare;
uniform vec3 uCold;
uniform vec2 uSize;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 uv = vUv;
  vec3 img = mix(texture(uImages, vec3(uv, uImage.x)).rgb, texture(uImages, vec3(uv, uImage.y)).rgb, uImage.z);
  if (uHighReady > 0.0) img = mix(img, mix(texture(uHighA, uv).rgb, texture(uHighB, uv).rgb, uImage.z), uHighReady);

  vec2 e2 = min(uv, 1.0 - uv) * uSize;
  float e = min(e2.x, e2.y);
  float hair = 1.0 - smoothstep(0.0, max(fwidth(e) * 1.3, 1e-4), e);
  vec3 rim = mix(uCold, img * 1.3 + 0.08, 0.5) * (hair + exp(-e * 9.0) * 0.18) * 1.2;

  vec3 rgb = (img + rim + uCold * uFlare * 0.9) * uVisibility;
  fragColor = vec4(rgb, uVisibility);
}

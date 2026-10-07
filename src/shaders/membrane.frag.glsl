// Mirrors the focused slice of the volume (fully resolved, opaque, under
// the same optical film) so the change of space at the swap is invisible.
// As the camera meets it the film turns to interference: Newton's rings
// spread over it and the wavelengths separate, then it opens.

precision highp sampler2DArray;

#include <spectral>

uniform sampler2DArray uImages;
uniform sampler2D uHighA;
uniform sampler2D uHighB;
uniform float uHighReady;
uniform vec3 uImage;       // moment A, moment B, blend
uniform float uVisibility;
uniform vec4 uOptics;      // film, spread, rings, dispersion (uv)
uniform float uWarmth;
uniform float uTime;
uniform vec2 uSize;

in vec2 vUv;
out vec4 fragColor;

vec3 moment(vec2 uv) {
  vec3 img = mix(texture(uImages, vec3(uv, uImage.x)).rgb, texture(uImages, vec3(uv, uImage.y)).rgb, uImage.z);
  if (uHighReady > 0.0) img = mix(img, mix(texture(uHighA, uv).rgb, texture(uHighB, uv).rgb, uImage.z), uHighReady);
  return img;
}

void main() {
  vec2 uv = vUv;
  vec3 img = moment(uv);
  vec2 shift = (uv - 0.5) * uOptics.w;
  if (uOptics.w > 0.0) {
    img.r = moment(uv + shift).r;
    img.b = moment(uv - shift).b;
  }

  vec2 e2 = min(uv, 1.0 - uv) * uSize;
  float e = min(e2.x, e2.y);
  float hair = 1.0 - smoothstep(0.0, max(fwidth(e) * 1.3, 1e-4), e);
  vec3 tint = spectralPalette(0.28 + e * 0.05, uWarmth);
  vec3 rim = mix(tint, img * 1.3 + 0.08, 0.5) * (hair + exp(-e * 9.0) * 0.18) * 1.2;

  vec3 film = membraneFilm(uv, uSize, 1.0, uOptics.y, uOptics.z, uTime, uWarmth) * uOptics.x;
  vec3 rgb = img * (1.0 - 0.3 * min(dot(film, vec3(0.3333)), 1.0)) + film + rim;
  fragColor = vec4(rgb * uVisibility, uVisibility);
}

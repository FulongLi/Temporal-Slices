// One temporal membrane. Alone it is almost invisible: it absorbs a little
// light, emits a little of its image and reflects a faint thin-film colour.
// Hundreds of them, blended back to front, accumulate into a solid,
// luminous optical body (an emission–absorption volume, sampled at each
// slice).
//
// Disclosure is continuous:
//   resting    a cold, heavily blurred memory of the image (high mip bias)
//   near       blur falls as neighbouring slices separate on screen
//   focused    the image itself, opaque, at full resolution, resolving
//              beneath an optical film that crosses it as it is drawn out
// Output is premultiplied: rgb is emitted light, alpha is absorption.
// Everything that varies slowly is computed per vertex; this shader runs
// hundreds of times per pixel, and only the few clearest slices pay for
// dispersion, only the extracted slice for its film.

precision highp sampler2DArray;

#include <spectral>

uniform sampler2DArray uImages;
uniform sampler2D uHighA;
uniform sampler2D uHighB;
uniform float uHighReady;
uniform vec3 uCold;
uniform vec2 uSize;
uniform float uTime;
uniform vec2 uFilmLight;   // film gain, warmth
uniform float uRings;      // Newton's rings in the entered membrane, per unit spread

in vec2 vUv;
in vec4 vLook;
in vec2 vLight;
in vec3 vAdd;
flat in vec4 vDisperse;
flat in vec3 vImage;
flat in vec4 vFocusOptic;  // close (any of the below), focus sweep, film, spread

out vec4 fragColor;

vec3 moment(vec2 uv, float bias) {
  vec3 img = texture(uImages, vec3(uv, vImage.x), bias).rgb;
  if (vImage.z > 0.001) img = mix(img, texture(uImages, vec3(uv, vImage.y), bias).rgb, vImage.z);
  return img;
}

void main() {
  vec2 uv = vUv;
  float bias = vLook.y;
  vec3 img = moment(uv, bias);

  // The few slices looked at closely (present, hover, extracted) pay for
  // what the hundreds of others must not: full resolution, dispersion and
  // the optical film. One branch, uniform across each slice.
  vec3 over = vec3(0.0);
  if (vFocusOptic.x > 0.0) {
    // The extracted slice: the optical film over the image (added below).
    if (vFocusOptic.z > 0.0) over = membraneFilm(uv, uSize, vFocusOptic.y, vFocusOptic.w, vFocusOptic.w * uRings, uTime, uFilmLight.y) * vFocusOptic.z;

    if (vFocusOptic.y > 0.0 && uHighReady > 0.0) {
      img = mix(img, mix(texture(uHighA, uv).rgb, texture(uHighB, uv).rgb, vImage.z), uHighReady);
    }
    // Dispersion: red and blue arrive slightly apart, visible only where
    // the image has contrast.
    vec2 shift = vDisperse.xy + (uv - 0.5) * vDisperse.z;
    if (vFocusOptic.y > 0.0 && uHighReady > 0.0) {
      img.r = mix(texture(uHighA, uv + shift).r, texture(uHighB, uv + shift).r, vImage.z);
      img.b = mix(texture(uHighA, uv - shift).b, texture(uHighB, uv - shift).b, vImage.z);
    } else {
      img.r = moment(uv + shift, bias).r;
      img.b = moment(uv - shift, bias).b;
    }
  }

  // Unexamined, an image is a cold memory of itself.
  float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));
  vec3 memory = mix(vec3(lum), img, 0.72) * mix(vec3(1.0), uCold, 0.12);
  vec3 col = mix(memory, img, vLook.x);

  // Edge light: a soft line around each membrane plus a faint halo. Its
  // colour is the hue of the membrane's own film; across the line the
  // wavelengths separate (red outermost, blue inward), which at the block's
  // silhouette, where hundreds of edges merge, reads as a fine spectral
  // fringe.
  vec2 e2 = min(uv, 1.0 - uv) * uSize;
  float e = min(e2.x, e2.y);
  float across = clamp(e / max(fwidth(e) * vLook.w, 1e-5), 0.0, 1.0);
  float hair = (1.0 - smoothstep(0.0, 1.0, across)) * 1.32 / vLook.w;
  float rim = (hair + exp(-e * 16.0) * 0.04) * vLook.z;
  vec3 film = (vAdd + vec3(0.7, 0.76, 0.86) * 1e-4) / (dot(vAdd, vec3(0.3333)) + 1e-4);
  vec3 fringe = mix(vec3(1.3, 0.95, 0.68), vec3(0.72, 0.95, 1.32), across);
  vec3 rimColor = mix(film * 0.75, img * 1.6 + 0.04, 0.5) * mix(vec3(1.0), fringe, vDisperse.w);

  vec3 rgb = col * vLight.x + rimColor * rim + vAdd;

  rgb = rgb * (1.0 - 0.3 * min(dot(over, vec3(0.3333)), 1.0)) + over;
  fragColor = vec4(rgb, vLight.y + rim * 0.25);
}

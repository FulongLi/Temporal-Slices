// One temporal membrane. Alone it is almost invisible: it absorbs a little
// light and emits a little of its image. Hundreds of them, blended back to
// front, accumulate into a solid, luminous body (an emission–absorption
// volume, sampled at each slice).
//
// Disclosure is continuous:
//   resting    a cold, heavily blurred memory of the image (high mip bias)
//   near       blur falls as neighbouring slices separate on screen
//   focused    the image itself, opaque, at full resolution
// Output is premultiplied: rgb is emitted light, alpha is absorption.
// Everything that varies slowly is computed per vertex; this shader runs
// hundreds of times per pixel.

precision highp sampler2DArray;

uniform sampler2DArray uImages;
uniform sampler2D uHighA;
uniform sampler2D uHighB;
uniform float uHighReady;
uniform vec3 uCold;
uniform vec2 uSize;

in vec2 vUv;
in vec4 vLook;
in vec2 vLight;
in vec3 vAdd;
flat in vec3 vImage;
flat in float vFocus;

out vec4 fragColor;

void main() {
  vec2 uv = vUv;
  float bias = vLook.y;
  vec3 img = texture(uImages, vec3(uv, vImage.x), bias).rgb;
  if (vImage.z > 0.001) img = mix(img, texture(uImages, vec3(uv, vImage.y), bias).rgb, vImage.z);
  if (vFocus > 0.0 && uHighReady > 0.0) {
    vec3 hi = mix(texture(uHighA, uv).rgb, texture(uHighB, uv).rgb, vImage.z);
    img = mix(img, hi, uHighReady);
  }

  // Unexamined, an image is a cold memory of itself.
  float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));
  vec3 memory = mix(vec3(lum), img, 0.72) * mix(vec3(1.0), uCold * 1.15, 0.22);
  vec3 col = mix(memory, img, vLook.x);

  // Edge light: a soft line around each membrane plus a faint halo.
  vec2 e2 = min(uv, 1.0 - uv) * uSize;
  float e = min(e2.x, e2.y);
  float hair = (1.0 - smoothstep(0.0, max(fwidth(e) * vLook.w, 1e-4), e)) * 1.32 / vLook.w;
  float rim = (hair + exp(-e * 16.0) * 0.04) * vLook.z;
  vec3 rimColor = mix(uCold * 0.8, img * 1.6 + 0.04, 0.65);

  vec3 rgb = col * vLight.x + rimColor * rim + vAdd;
  fragColor = vec4(rgb, vLight.y + rim * 0.25);
}

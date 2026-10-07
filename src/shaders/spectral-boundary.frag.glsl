// The spectral boundary, over the whole view (a post-processing effect).
//
//   travelling   wavelengths separate a little toward the edges of the view
//   the passage  as the camera crosses the membrane an interference field
//                covers the viewport (Newton's rings bent by the image
//                itself), the wavelengths separate further, then colour
//                resolves back into the scene
//
// Never a white flash: the field tints and rings the scene, and adds only a
// little light of its own.

#include <spectral>

uniform float uDispersion;    // radial separation of red and blue (uv per uv from centre)
uniform float uInterference;  // 0..1
uniform float uWarmth;
uniform float uClock;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;
  vec2 d = uv - 0.5;
  float r = length(d * vec2(aspect, 1.0));

  if (uDispersion > 0.0) {
    // Red outward, blue inward, green fixed; nothing at the centre of view.
    // Added as differences so the light already added by bloom is kept.
    vec2 off = d * uDispersion * smoothstep(0.05, 0.75, r);
    vec3 here = texture2D(inputBuffer, uv).rgb;
    col.r += texture2D(inputBuffer, uv + off).r - here.r;
    col.b += texture2D(inputBuffer, uv - off).b - here.b;
  }

  if (uInterference > 0.0) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float phase = r * r * 2.6 - uClock * 0.2 + lum * 0.4;
    vec3 film = mix(vec3(0.62, 0.68, 0.8), spectralPalette(phase, uWarmth), 0.75);
    float k = uInterference;
    col = mix(col, col * (0.45 + film * 0.9), k * 0.6) + film * k * k * 0.12;
  }

  outputColor = vec4(max(col, 0.0), inputColor.a);
}

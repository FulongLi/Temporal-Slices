// Spectral optics shared by the volume, the membrane, the light beneath the
// block and the passage. Physically inspired rather than exact: every term
// is a handful of analytic operations (no loops, no noise, no textures), so
// it can run per vertex for hundreds of slices, and per fragment where one
// surface matters.
//
// Included with `#include <spectral>`; every function takes its inputs as
// arguments, so the chunk declares no uniforms of its own.

// 0 facing the surface, 1 at grazing incidence.
float fresnelTerm(vec3 normal, vec3 viewDir, float power) {
  return pow(max(1.0 - abs(dot(normal, viewDir)), 0.0), power);
}

// A deliberately nonuniform loop through the colours thin films reflect,
// biased cool, with the warm part brief:
//
//   0.00 deep blue · 0.16 violet · 0.34 cyan · 0.52 pale green
//   0.68 soft gold · 0.80 magenta (brief) · 1.00 deep blue again
//
// `warmth` (0..1) lets gold and magenta through; at 0 they fall back to a
// pale silver-blue and the loop stays entirely cool. Linear colour.
vec3 spectralPalette(float phase, float warmth) {
  float t = fract(phase);
  vec3 blue = vec3(0.09, 0.2, 0.72);
  vec3 pale = vec3(0.5, 0.58, 0.74);
  vec3 c = blue;
  c = mix(c, vec3(0.36, 0.2, 0.8), smoothstep(0.0, 0.16, t));
  c = mix(c, vec3(0.1, 0.55, 0.8), smoothstep(0.16, 0.34, t));
  c = mix(c, vec3(0.38, 0.72, 0.52), smoothstep(0.34, 0.52, t));
  c = mix(c, mix(pale, vec3(0.95, 0.64, 0.24), warmth), smoothstep(0.52, 0.68, t));
  c = mix(c, mix(pale, vec3(0.84, 0.22, 0.56), warmth), smoothstep(0.68, 0.8, t));
  c = mix(c, blue, smoothstep(0.8, 1.0, t));
  return c;
}

// Optical path through a thin film of index ~1.45, reduced to 0 (facing)
// .. ~0.28 (grazing): the path shortens as the refracted ray tilts.
float filmPath(vec3 normal, vec3 viewDir) {
  float c = min(abs(dot(normal, viewDir)), 1.0);
  float cosT = sqrt(1.0 - (1.0 - c * c) / 2.1);
  return max(1.0 - cosT, 0.0);
}

// The colour a thin film reflects. Facing it, almost nothing changes and
// what it reflects is silver with a faint cool cast; as the view turns
// oblique the optical path moves the colour through the palette and the
// colour saturates. `thickness` is how far it travels through the palette;
// `phase` shifts it (depth, waves, disturbance).
vec3 thinFilmColor(vec3 normal, vec3 viewDir, float thickness, float phase, float warmth) {
  float path = filmPath(normal, viewDir);
  vec3 tint = spectralPalette(thickness * path + phase, warmth);
  vec3 silver = vec3(0.74, 0.78, 0.86);
  return mix(silver, tint, smoothstep(0.015, 0.2, path));
}

// One soft sheet of light inside the volume. `p` is normalised to the
// block (about -0.5..0.5 on every axis), `normal` orients the sheet.
float spectralBand(vec3 p, vec3 normal, float offset, float width) {
  float d = (dot(p, normal) - offset) / width;
  return exp(-d * d);
}

// A low-frequency caustic network: two domain-warped waves whose crossings
// cancel into thin bright filaments. `p` in world units across a surface,
// `phase` drifts it (time, depth, waves).
float causticField(vec2 p, float phase) {
  vec2 q = p * 0.85;
  q += 0.6 * vec2(sin(q.y * 1.3 + phase), sin(q.x * 1.1 - phase * 0.8));
  float a = sin(q.x + phase * 0.6);
  float b = sin(q.y * 1.25 - phase * 0.45);
  float c = 1.0 - abs(a + b) * 0.5;
  c *= c * c;
  return c * c;
}

// The optical film over one membrane: the extracted slice, and the surface
// crossed when entering it. Returns colour × coverage.
//   sweep   0..1, a front of colour crossing the membrane as it is drawn out
//   spread  0..1, interference growing from the centre (the passage)
//   rings   strength of Newton's rings inside that disc
vec3 membraneFilm(vec2 uv, vec2 size, float sweep, float spread, float rings, float time, float warmth) {
  vec2 q = (uv - 0.5) * vec2(size.x / size.y, 1.0);
  float r = length(q);
  vec2 e2 = min(uv, 1.0 - uv) * size;
  float e = min(e2.x, e2.y) / size.y;

  // A slowly flowing film thickness: two low frequencies, nothing busy.
  float thick = 0.16 * sin(q.x * 3.1 + q.y * 1.7 + time * 0.21) + 0.1 * sin(q.y * 4.3 - q.x * 2.2 - time * 0.17);

  // A front of colour crossing the diagonal, leaving a fading wake.
  float f = dot(q, vec2(0.84, 0.54));
  float front = mix(-1.2, 1.2, sweep);
  float x = (f - front) / 0.14;
  float crest = exp(-x * x);
  float wake = (1.0 - smoothstep(front - 0.55, front + 0.05, f)) * (1.0 - sweep);

  // The edges stay iridescent.
  float edge = exp(-e * 11.0);

  // The passage: a disc of interference opening from the centre.
  float radius = spread * 1.05;
  float y = (r - radius) / 0.07;
  float disc = (1.0 - smoothstep(radius - 0.3, radius, r)) * spread * 0.3 + exp(-y * y) * spread * (1.0 - spread * 0.5);

  float coverage = crest + 0.4 * wake + 0.75 * edge + disc;
  float phase = 0.24 + thick + f * 0.16 + edge * 0.18 + rings * (r * r * 3.0 - time * 0.12);
  return spectralPalette(phase, warmth) * coverage;
}

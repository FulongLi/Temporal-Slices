// The temporal volume: hundreds of thin slices drawn as instances of one
// plane. Everything that moves happens here, as displacement measured in
// slices along the time axis, so the block always moves as one medium:
//
//   waves      a packet travels through the block; layers bunch and spread
//   breathing  a very slow drift of density along the whole block
//   travel     moving through time compresses the block ahead of the present
//              and stretches it behind
//   focus      a gap opens around the chosen slice, which slides partly out
//
// Appearance (how much light a slice emits and absorbs, how sharp its image
// is, its optics and fog) is also decided here: it varies slowly across a
// slice, and the fragment shader runs hundreds of times per pixel, so it
// does as little as possible.
//
// Optics (see spectral.glsl and SPECTRAL_LOOK):
//   film       each membrane reflects a faint thin-film colour that depends
//              on the view angle; it is scaled by absorption, so one slice
//              barely tints and hundreds accumulate into an optical body
//   waves      a passing packet carries a spectral pulse (violet ahead,
//              cyan at its centre, gold behind)
//   focus      the extracted slice's neighbours shift phase, falling off
//              exponentially; the slice itself gets a film of its own
//   highlight  a narrow anisotropic spectral streak and a soft sheen
//   bands      1–2 large sheets of light drifting through the block
//   caustics   strength and colour for the fragment shader's caustic field
//   dispersion per-channel offsets for rims and for the clearest images

#include <spectral>

in float aSlice;
in vec3 aImage;   // moment A, moment B, blend
in float aSeed;

uniform float uTime;
uniform float uCount;
uniform float uSpacing;
uniform float uFrontZ;
uniform vec2 uSize;          // slice width, height
uniform float uPixelScale;   // pixels per world unit at distance 1

uniform float uCursor;       // the present, in slices
uniform float uTravel;       // normalised travel speed, -1..1
uniform vec4 uWaves[4];      // position, strength, width, direction
uniform vec4 uFocus;         // index, amount, previous index, previous amount
uniform vec4 uExtract;       // side, lift, forward (world), yaw, at amount 1
uniform vec2 uFocusScale;    // scale of the current and previous focused slice
uniform vec2 uSeparation;    // gap size (slices), reach (slices)
uniform vec2 uHover;         // index, amount
uniform vec3 uEnter;         // ripple, bend (, unused) of the slice being entered

uniform float uIntro;        // 0..1 the block assembles from the back
uniform float uGhost;        // presence of slices already travelled through
uniform float uDim;          // the rest of the block during the passage
uniform float uFocusDim;     // the rest of the block while one slice is examined
uniform float uAbsorb;       // opacity of one resting slice
uniform float uGain;         // emission relative to absorption
uniform float uBlur;         // mip bias of an unexamined slice
uniform float uRim;          // edge light of one resting slice
uniform vec3 uLight;         // view-space direction toward the key light
uniform float uFogDensity;

// Optics (SPECTRAL_LOOK)
uniform vec4 uFilm;          // iridescence, fresnel power, thickness, depth phase
uniform vec2 uFilmLight;     // film gain, warmth
uniform vec2 uHighlight;     // anisotropic streak, sheen
uniform vec3 uMotionOptics;  // wave colour, breathing phase, motion boost
uniform float uMotion;       // 0..1 camera movement and travel, smoothed
uniform vec3 uNeighbour;     // strength, reach (slices), unused
uniform vec3 uFocusFilm;     // film while drawn out, film once settled, enter boost
uniform vec4 uPassage;       // film, spread, dispersion (uv), interference (engine passageOptics)
uniform vec3 uVolumeOptics;  // bands, caustics, dispersion

out vec2 vUv;
out vec4 vLook;      // clarity, mip bias, edge light, edge line width (in pixels / fwidth)
out vec2 vLight;     // emission, absorption
out vec3 vAdd;       // film, highlights, bands and caustics, premultiplied (its hue also tints the edges)
// Per-slice optics are flat: constant across a slice, so the fragment
// shader neither interpolates them nor diverges on them.
flat out vec4 vDisperse;    // image offset (uv), radial image offset, edge dispersion (0..1)
flat out vec3 vImage;
flat out vec4 vFocusOptic;  // close (1 for the few slices given the costly treatment), focus sweep, film, spread

float bendAt(vec2 uv, float s, float bow, float ripple) {
  vec2 q = uv * 2.0 - 1.0;
  float across = 1.0 - q.x * q.x;
  float z = bow * across * (1.0 - 0.35 * q.y * q.y);
  z += sin(uTime * 0.23 + s * 0.017 + q.x * 1.3) * 0.01 * across;
  if (ripple > 0.0) {
    float r = length(vec2(q.x * uSize.x / uSize.y, q.y));
    z += ripple * sin(r * 7.0 - uTime * 2.6) * exp(-r * 0.8) * 0.07;
  }
  return z;
}

void main() {
  float s = aSlice;
  vUv = uv;
  vImage = aImage;

  // ── Longitudinal displacement (in slices) and transverse bow (world) ──
  float shift = 0.0;
  float bow = 0.0;
  float shear = 0.0;
  float swell = 0.0;
  float lead = 0.0;   // where this slice sits in the packets: > 0 ahead, < 0 behind
  for (int k = 0; k < 4; k++) {
    vec4 w = uWaves[k];
    if (w.y <= 0.0) continue;
    float x = (s - w.x) / w.z;
    float g = exp(-x * x);
    shift -= w.y * 2.33 * x * g;
    bow += w.y * g * 0.034 * w.w;
    shear += w.y * x * g * 0.012;
    swell += w.y * g;
    lead += w.y * g * x * w.w;
  }
  float breathe = sin(uTime * 0.31 + s * 0.021);
  shift += 0.7 * breathe;
  shift += uTravel * 9.0 * exp(-abs(s - uCursor) / 28.0);

  float mine = 0.0;
  float entering = 0.0;   // 1 for the slice the passage enters
  float scale = 1.0;
  float yaw = 0.0;
  vec3 extract = vec3(0.0);
  float disturb = 0.0;    // spectral disturbance from an extraction nearby
  float disturbSide = 0.0;
  for (int k = 0; k < 2; k++) {
    float f = k == 0 ? uFocus.x : uFocus.z;
    float a = k == 0 ? uFocus.y : uFocus.w;
    if (a <= 0.0) continue;
    float d = s - f;
    if (abs(d) < 0.5) {
      mine = a;
      entering = k == 0 ? 1.0 : 0.0;
      scale = k == 0 ? uFocusScale.x : uFocusScale.y;
      yaw = uExtract.w * a;
      extract = uExtract.xyz * a;
    } else {
      shift += sign(d) * uSeparation.x * a * exp(-abs(d) / uSeparation.y);
      float k2 = a * exp(-(abs(d) - 1.0) / uNeighbour.y);
      disturb += k2;
      disturbSide += k2 * sign(d);
    }
  }
  // The extracted slice is held still, so it stands exactly where the
  // camera expects it (the engine's slicePose).
  shift *= 1.0 - mine;
  bow *= 1.0 - mine;
  shear *= 1.0 - mine;
  float ripple = mine > 0.0 ? uEnter.x : 0.0;
  bow += mine > 0.0 ? uEnter.y * 0.08 : 0.0;

  // ── Position ──
  vec3 local = vec3(position.xy * uSize, 0.0);
  local.z = bendAt(uv, s, bow, ripple);
  // Normal from the bend, by finite differences across the surface.
  vec2 e = vec2(0.02, 0.0);
  float dzx = (bendAt(uv + e.xy, s, bow, ripple) - bendAt(uv - e.xy, s, bow, ripple)) / (2.0 * e.x * uSize.x);
  float dzy = (bendAt(uv + e.yx, s, bow, ripple) - bendAt(uv - e.yx, s, bow, ripple)) / (2.0 * e.x * uSize.y);
  vec3 n = normalize(vec3(-dzx, -dzy, 1.0));

  local *= scale;
  float c = cos(yaw);
  float sn = sin(yaw);
  local = vec3(local.x * c + local.z * sn, local.y, -local.x * sn + local.z * c);
  n = vec3(n.x * c + n.z * sn, n.y, -n.x * sn + n.z * c);
  vec3 p = local + vec3(shear, 0.0, uFrontZ - (s + shift) * uSpacing) + extract;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 view = viewMatrix * world;
  gl_Position = projectionMatrix * view;
  float depth = max(-view.z, 0.1);

  // How far apart neighbouring slices appear on screen, in pixels.
  vec3 toEye = normalize(world.xyz - cameraPosition);
  float spacingPx = uSpacing * length(toEye.xy) * uPixelScale / depth;

  // ── Appearance ──
  float d = s - uCursor;
  float focusAny = max(uFocus.y, uFocus.w);
  // Slices already travelled through thin to a ghost. While a slice is
  // examined they open fully, keeping only the near side of the gap, and
  // the far block fades so attention (and fill rate) stays on the moment.
  float past = 1.0;
  if (d < 0.0) {
    float travelled = mix(uGhost, 1.0, smoothstep(-26.0, -0.5, d));
    float opened = 0.12 * smoothstep(-16.0, -1.0, d);
    past = mix(travelled, opened, focusAny);
  }
  float far = 1.0 - 0.85 * focusAny * smoothstep(110.0, 320.0, d);
  float fromBack = uCount - 1.0 - s;
  float appear = clamp((uIntro * (uCount + 90.0) - fromBack) / 90.0, 0.0, 1.0);
  float present = exp(-abs(d) * 0.9) * (1.0 - focusAny);
  float hover = abs(s - uHover.x) < 0.5 ? uHover.y : 0.0;
  float others = (1.0 - uFocusDim * focusAny) * (1.0 - uDim * 0.94);
  float weight = past * far * appear * mix(others, 1.0, mine);
  // A passing wave carries a faint band of light through the block.
  float wave = swell * (1.0 - mine) * 0.25;
  float fog = exp(-pow(uFogDensity * depth, 2.0));

  // Slices resolve as they separate on screen (the observer comes closer).
  float apart = smoothstep(2.0, 14.0, spacingPx);
  float clarity = max(max(smoothstep(0.2, 1.0, mine), present * 0.38 + hover * 0.14), apart * 0.45);
  float bias = max(0.0, uBlur * (1.0 - clarity) - 3.0 * apart);

  // Edge light. Where slices pack closer than a pixel their edges merge into
  // one glowing face, so each edge is weighted by its share of the pixel,
  // and drawn wider (with the same total light) so neighbours blend instead
  // of beating into moiré.
  float share = min(spacingPx, 1.0) * mix(0.35, 1.0, smoothstep(1.5, 7.0, spacingPx));
  float rimK = (uRim * (1.0 + wave) + present * 1.6 + hover * 1.8 + mine * 0.7) * weight * (d < 0.0 ? 1.0 - 0.7 * focusAny : 1.0) * (0.85 + 0.3 * aSeed);
  float widen = max(2.2, 3.2 / max(spacingPx, 0.25));
  vLook = vec4(clarity, bias, rimK * mix(share, 1.0, mine) * fog, widen);

  float alpha = mix(uAbsorb * weight * (1.0 + present * 9.0 + hover * 5.0 + wave * 0.3), 0.97, mine);
  float emit = alpha * mix(uGain, 1.0, mine);
  vLight = vec2(emit * fog, alpha * mix(1.0, fog, 0.5));

  // ── Optics ──
  vec3 V = normalize(-view.xyz);
  vec3 nv = normalize(mat3(viewMatrix) * n);
  nv *= sign(dot(nv, V) + 1e-4);   // slices are seen from both sides
  float path = filmPath(nv, V);
  float fres = fresnelTerm(nv, V, uFilm.y);
  float warmth = uFilmLight.y;
  float density = (1.0 - mine) * fog;   // the extracted slice has its own film

  // Resting film: angle first, then a slowly flowing thickness across the
  // membrane (shared by neighbouring slices, so it survives accumulation),
  // a drift through depth, a little per-slice variation, and the breathing.
  vec2 q = position.xy * 6.2832;
  float flow = 0.16 * sin(q.x * 0.55 + q.y * 0.35 + s * 0.006 + uTime * 0.031)
             + 0.1 * sin(q.y * 0.8 - q.x * 0.3 - s * 0.009 - uTime * 0.023);
  float phase = s * uFilm.w + flow + aSeed * 0.035 + breathe * uMotionOptics.y;
  float irid = uFilm.x * fres * (1.0 + uMotionOptics.z * uMotion);
  vec3 sheenTone = thinFilmColor(nv, V, uFilm.z, phase, warmth) * irid;

  // Waves: violet ahead of the packet, cyan at its centre, gold behind.
  float waveK = (1.0 - exp(-swell * 0.45)) * uMotionOptics.x;
  float side = lead / max(swell, 1e-3);
  float wavePhase = 0.4 - 0.27 * tanh(side * 1.3) + path * 0.8;
  sheenTone += spectralPalette(wavePhase, warmth) * waveK * (0.45 + 0.55 * sqrt(path * 3.6));

  // Neighbours of an extracted slice: each side of the gap shifts phase
  // the other way, so the disturbance reads as a colour fringe.
  float dk = disturb * uNeighbour.x;
  sheenTone += spectralPalette(0.3 + path * uFilm.z + disturbSide * 0.12 / max(disturb, 1e-3), warmth) * dk;

  vec3 silver = vec3(0.7, 0.76, 0.86);

  // Highlights: a narrow, anisotropic spectral streak along the slice's
  // height, and a soft silver sheen toward grazing angles.
  vec3 H = normalize(uLight + V);
  vec3 T = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
  T = normalize(T - nv * dot(T, nv));
  vec3 B = cross(nv, T);
  float hn = max(dot(H, nv), 0.05);
  float ht = dot(H, T) / 0.42;
  float hb = dot(H, B) / 0.07;
  float streak = exp(-(ht * ht + hb * hb) / (hn * hn));
  vec3 streakTone = mix(vec3(0.85, 0.88, 0.95), spectralPalette(0.22 + dot(H, B) * 2.4 + phase, warmth), 0.7);
  vec3 R = reflect(-V, nv);
  float sky = smoothstep(-0.25, 0.9, (R * mat3(viewMatrix)).y);   // world-space up: a brighter sky above
  float edgeOn = max(1.0 - abs(dot(nv, V)), 0.0);
  vec3 sheen = silver * edgeOn * edgeOn * edgeOn * edgeOn * sky;
  vec3 light = (streakTone * streak * uHighlight.x * 6.0 + sheen * uHighlight.y * 2.0) * alpha;

  // Internal bands: one wide cyan-violet sheet and, rarely, a thin gold one
  // that shows only at grazing angles. They bend with the layers.
  vec3 bands = vec3(0.0);
  if (uVolumeOptics.x > 0.0) {
    vec3 pn = vec3(position.xy, (s + shift) / uCount - 0.5);
    float b1 = spectralBand(pn, normalize(vec3(0.42, 0.78, 0.46)), 0.5 * sin(uTime * 0.043 + 1.3), 0.11);
    float gate = pow(max(0.5 + 0.5 * sin(uTime * 0.071 + 2.0), 0.0), 6.0) * smoothstep(0.04, 0.16, path);
    float b2 = spectralBand(pn, normalize(vec3(-0.62, 0.22, 0.75)), 0.62 * sin(uTime * 0.029), 0.03) * gate;
    bands = spectralPalette(0.2 + 0.12 * sin(uTime * 0.05) + path * 1.2, warmth) * b1 * 0.55;
    bands += spectralPalette(0.68, warmth) * b2 * 0.9;
    bands *= uVolumeOptics.x * (1.0 + waveK);
  }

  // What is added here accumulates with density: one slice barely tints,
  // hundreds become a spectral body.
  // Scaled by absorption, not emission, so the optics do not depend on how
  // bright an archive's imagery is.
  vec3 film = (sheenTone * uFilmLight.x + bands) * alpha * density;

  // Per-slice optics, from the view of the slice's centre so they are the
  // same at every vertex of it.
  vec3 centre = (modelMatrix * vec4(vec3(shear, 0.0, uFrontZ - (s + shift) * uSpacing) + extract, 1.0)).xyz;
  vec3 toCentre = normalize(centre - cameraPosition);
  vec3 axisX = vec3(c, 0.0, -sn);
  vec3 axisZ = vec3(sn, 0.0, c);
  float pathC = filmPath(axisZ, -toCentre);

  // Caustics where the medium is disturbed: waves, an extraction,
  // movement (the haze beneath the block carries the resting ones). The
  // field is low-frequency, so it is sampled per vertex.
  float caustic = uVolumeOptics.y * (waveK * 0.45 + dk * 0.4 + uMotion * 0.08);
  if (caustic > 0.001) {
    float field = causticField(uv * uSize, s * 0.035 + uTime * 0.12 + lead * 0.4);
    film += spectralPalette(0.3 + s * uFilm.w * 2.0 + pathC * 1.5 + wavePhase * waveK, warmth) * field * caustic * alpha * density;
  }
  vAdd = (film + light * mix(1.0, 0.08, mine) * (1.0 - entering * uPassage.y)) * fog;

  // Dispersion: wavelengths travel the layered material slightly
  // differently, more so at oblique angles and deeper inside the block.
  // Image separation costs two extra samples, so only the clearest slices
  // (present, hover, extracted) pay for it.
  float inside = clamp(abs(d) / 160.0, 0.0, 1.0);
  float disperse = uVolumeOptics.z;
  vec2 across = vec2(dot(toCentre, axisX), toCentre.y);
  float clear = max(max(present, hover), mine);
  float imageShift = clear > 0.05 ? disperse * clear * (0.0016 + 0.004 * pathC) * (1.0 + 1.5 * waveK + uMotion) : 0.0;
  float radial = disperse * entering * uPassage.z * uFocusFilm.z;
  float edge = clamp((0.25 + 1.2 * pathC + 0.5 * inside + 0.7 * waveK) * mix(0.35, 1.0, disperse), 0.0, 1.0);
  vDisperse = vec4(across * imageShift, radial, edge);

  // The extracted slice: edge first, then a front of colour, then the image
  // resolves beneath the film (see clarity above). The entered slice adds
  // the passage: film, a disc of interference, Newton's rings.
  float drawn = smoothstep(0.0, 1.0, mine);
  float focusFilm = uFocusFilm.x * sin(3.14159 * drawn) + uFocusFilm.y * drawn;
  float enterFilm = entering * uPassage.x * uFocusFilm.z;
  float close = mine > 0.0 || imageShift > 0.0 ? 1.0 : 0.0;
  vFocusOptic = vec4(close, smoothstep(0.08, 0.9, mine), (focusFilm + enterFilm) * fog, entering * uPassage.y);

  // Slices that contribute nothing collapse to a point outside the view.
  if (weight < 0.002 && mine <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

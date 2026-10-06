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
// is, its glass highlight and fog) is also decided here: it varies slowly
// across a slice, and the fragment shader runs hundreds of times per pixel,
// so it does as little as possible.

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
uniform vec3 uEnter;         // ripple, bend, flare of the slice being entered

uniform float uIntro;        // 0..1 the block assembles from the back
uniform float uGhost;        // presence of slices already travelled through
uniform float uDim;          // the rest of the block during the passage
uniform float uFocusDim;     // the rest of the block while one slice is examined
uniform float uAbsorb;       // opacity of one resting slice
uniform float uGain;         // emission relative to absorption
uniform float uBlur;         // mip bias of an unexamined slice
uniform float uRim;          // edge light of one resting slice
uniform vec3 uCold;
uniform vec3 uLight;         // view-space direction toward the key light
uniform float uFogDensity;

out vec2 vUv;
out vec4 vLook;   // clarity, mip bias, edge light, edge line width (in pixels / fwidth)
out vec2 vLight;  // emission, absorption
out vec3 vAdd;    // glass highlight and flare, already premultiplied
flat out vec3 vImage;
flat out float vFocus;

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
  for (int k = 0; k < 4; k++) {
    vec4 w = uWaves[k];
    if (w.y <= 0.0) continue;
    float x = (s - w.x) / w.z;
    float g = exp(-x * x);
    shift -= w.y * 2.33 * x * g;
    bow += w.y * g * 0.034 * w.w;
    shear += w.y * x * g * 0.012;
    swell += w.y * g;
  }
  shift += 0.7 * sin(uTime * 0.31 + s * 0.021);
  shift += uTravel * 9.0 * exp(-abs(s - uCursor) / 28.0);

  float mine = 0.0;
  float scale = 1.0;
  float yaw = 0.0;
  vec3 extract = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float f = k == 0 ? uFocus.x : uFocus.z;
    float a = k == 0 ? uFocus.y : uFocus.w;
    if (a <= 0.0) continue;
    float d = s - f;
    if (abs(d) < 0.5) {
      mine = a;
      scale = k == 0 ? uFocusScale.x : uFocusScale.y;
      yaw = uExtract.w * a;
      extract = uExtract.xyz * a;
    } else {
      shift += sign(d) * uSeparation.x * a * exp(-abs(d) / uSeparation.y);
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
  float clarity = max(max(mine, present * 0.38 + hover * 0.14), apart * 0.45);
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

  // Glass: a soft highlight that slides across the layers as they bend.
  vec3 nv = normalize(mat3(viewMatrix) * n);
  float spec = pow(max(dot(nv, normalize(uLight - normalize(view.xyz))), 0.0), 90.0);
  float flare = mine > 0.0 ? uEnter.z : 0.0;
  vAdd = uCold * (spec * alpha * 6.0 + flare * 0.9) * fog;
  vFocus = mine;

  // Slices that contribute nothing collapse to a point outside the view.
  if (weight < 0.002 && mine <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

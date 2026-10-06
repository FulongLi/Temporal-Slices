#!/usr/bin/env node
/**
 * Procedural demo content for Temporal Slices: one lunar settlement observed
 * at 40 moments between 2031 and 2351.
 *
 * Every structure is defined once with a fixed seed, so it keeps its identity
 * from slice to slice: the same window lights, the same glass panels, the same
 * cracks. Time only changes how much of each structure exists.
 *
 * Output (all original, generated artwork — no external media):
 *   public/datasets/lunar-city/slice-XX.svg           composite image
 *   public/datasets/lunar-city/slice-XX-l{0,1,2}.svg  depth layers (backdrop, city, foreground)
 *   src/data/lunar-city/temporal-slices.json          the temporal dataset
 *
 * Run with `npm run generate:demo`.
 */
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_DIR = join(ROOT, "public/datasets/lunar-city");
const DATA_FILE = join(ROOT, "src/data/lunar-city/temporal-slices.json");
const PUBLIC_PREFIX = "datasets/lunar-city";

const W = 1600;
const H = 1000;
const HORIZON = 600;

// ───────────────────────────────────────────────────────────── utilities ──

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const f = (n) => (Math.round(n * 10) / 10).toString();
const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("");
}
const mixHex = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
};

/** Interpolate keyframed values ({year: value}) for colour or number. */
function keyframes(frames, year) {
  const keys = Object.keys(frames).map(Number).sort((a, b) => a - b);
  if (year <= keys[0]) return frames[keys[0]];
  if (year >= keys[keys.length - 1]) return frames[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (year >= a && year <= b) {
      const t = smooth(0, 1, (year - a) / (b - a));
      const va = frames[a];
      const vb = frames[b];
      return typeof va === "number" ? lerp(va, vb, t) : mixHex(va, vb, t);
    }
  }
  return frames[keys[0]];
}

/** 1D value noise for ridgelines and dunes. */
function noise1(seed) {
  const r = mulberry32(seed);
  const table = Array.from({ length: 256 }, () => r());
  return (x) => {
    const i = Math.floor(x);
    const t = x - i;
    const a = table[((i % 256) + 256) % 256];
    const b = table[(((i + 1) % 256) + 256) % 256];
    const s = t * t * (3 - 2 * t);
    return a + (b - a) * s;
  };
}

// ────────────────────────────────────────────────────────── world curves ──

/** Fraction of the settlement's population present. */
const life = (t) => smooth(2029, 2052, t) * (1 - smooth(2104, 2142, t));
/** Overall decay of the environment. */
const decay = (t) => smooth(2135, 2345, t);
/** Height of accumulated regolith dunes (px in image space). */
const dustHeight = (t) => 6 + 300 * Math.pow(smooth(2140, 2360, t), 1.35);
/** Escaped greenhouse growth: appears after the domes fail, dries out later. */
const growth = (t) => smooth(2196, 2236, t) * (1 - smooth(2290, 2340, t) * 0.85);
const dryness = (t) => smooth(2258, 2300, t);
/** Final erasure: everything not yet buried fades into the dust. */
const erasure = (t) => smooth(2290, 2358, t);

const palette = (t) => ({
  skyTop: keyframes({ 2030: "#010208", 2150: "#020306", 2300: "#060505", 2351: "#0a0908" }, t),
  skyLow: keyframes({ 2030: "#07101f", 2090: "#0b1528", 2150: "#080d16", 2250: "#110f0d", 2351: "#1a1714" }, t),
  ridgeFar: keyframes({ 2030: "#252a33", 2200: "#2b2a28", 2351: "#3a3631" }, t),
  ridgeNear: keyframes({ 2030: "#343a45", 2200: "#3b3934", 2351: "#4a443c" }, t),
  groundFar: keyframes({ 2030: "#3b414c", 2150: "#3d3f43", 2260: "#4b463d", 2351: "#5b5447" }, t),
  groundNear: keyframes({ 2030: "#15181e", 2150: "#18191c", 2260: "#221f1a", 2351: "#2e2a23" }, t),
  struct: keyframes({ 2030: "#c9d1db", 2090: "#d6dce3", 2150: "#8e939a", 2220: "#6e6c66", 2300: "#5f584d", 2351: "#6e675a" }, t),
  structShade: keyframes({ 2030: "#4b5563", 2150: "#3d4249", 2260: "#35322d", 2351: "#3e3a33" }, t),
  glass: keyframes({ 2030: "#86c8ff", 2090: "#9fd2ff", 2140: "#5e88a8", 2200: "#4d5d68", 2300: "#4a4a45" }, t),
  light: keyframes({ 2030: "#ffe2b0", 2090: "#ffd59a", 2140: "#ffc27a" }, t),
  haze: keyframes({ 2030: "#000000", 2140: "#1c1d20", 2220: "#5c554a", 2300: "#8a7f6c", 2351: "#a39a87" }, t),
  hazeA: keyframes({ 2030: 0, 2140: 0.04, 2220: 0.12, 2300: 0.24, 2351: 0.36 }, t),
  dune: keyframes({ 2030: "#2a2d33", 2200: "#3f3b34", 2300: "#5a5244", 2351: "#6b6252" }, t),
  duneHi: keyframes({ 2030: "#4a4f58", 2200: "#5f594e", 2300: "#7b705c", 2351: "#8d826c" }, t),
});

// ─────────────────────────────────────────────────────────── structures ──
// Each structure: position, size, build year, collapse year, and its own seed.

const STRUCTURES = [
  { type: "dome", x: 250, y: 652, r: 54, built: 2061, collapse: 2190 },
  { type: "dome", x: 1290, y: 650, r: 60, built: 2068, collapse: 2214 },
  { type: "tower", x: 180, y: 654, w: 24, h: 118, built: 2091, collapse: 2208 },
  { type: "tower", x: 1462, y: 650, w: 22, h: 112, built: 2088, collapse: 2184 },
  { type: "tower", x: 1392, y: 660, w: 26, h: 142, built: 2079, collapse: 2196 },
  { type: "tower", x: 1182, y: 666, w: 30, h: 182, built: 2072, collapse: 2201 },
  { type: "tower", x: 352, y: 668, w: 30, h: 172, built: 2075, collapse: 2222 },
  { type: "spire", x: 842, y: 668, w: 40, h: 470, built: 2097, collapse: 2322 },
  { type: "tower", x: 700, y: 664, w: 30, h: 205, built: 2083, collapse: 2257 },
  { type: "tower", x: 990, y: 674, w: 34, h: 214, built: 2063, collapse: 2229 },
  { type: "tower", x: 520, y: 679, w: 38, h: 262, built: 2066, collapse: 2271 },
  { type: "tower", x: 905, y: 686, w: 42, h: 302, built: 2057, collapse: 2287 },
  { type: "tower", x: 622, y: 689, w: 46, h: 232, built: 2053, collapse: 2246 },
  { type: "dish", x: 1505, y: 690, r: 34, built: 2040, collapse: 2179 },
  { type: "dome", x: 1080, y: 692, r: 112, built: 2044, collapse: 2205 },
  { type: "dome", x: 430, y: 697, r: 96, built: 2052, collapse: 2238 },
  { type: "dome", x: 760, y: 704, r: 152, built: 2031, collapse: 2262 },
  { type: "module", x: 568, y: 716, len: 118, built: 2034, collapse: 2230 },
  { type: "module", x: 932, y: 718, len: 92, built: 2038, collapse: 2244 },
  { type: "module", x: 1212, y: 712, len: 78, built: 2049, collapse: 2219 },
  { type: "solar", x: 70, y: 742, cols: 6, built: 2033, collapse: 2200 },
  { type: "solar", x: 1240, y: 760, cols: 5, built: 2047, collapse: 2188 },
].map((s, i) => ({ ...s, seed: 1000 + i * 7919, lean: (mulberry32(77 + i)() - 0.5) * 2 }));

const TUBES = [
  [760, 430, 2053],
  [760, 1080, 2045],
  [430, 250, 2062],
  [1080, 1290, 2069],
];

const PAD = { x: 1360, y: 790, rx: 96, built: 2039 };
const SHIP = { arrive: 2040, depart: 2141 };
const DRIVER = { from: [1030, 646], to: [1600, 548], built: 2061, quiet: 2122, collapse: 2246 };
const BEACON_UNTIL = 2198;

const damageOf = (s, t) => smooth(s.collapse - 75, s.collapse, t);
const collapsedOf = (s, t) => t >= s.collapse;
const erodeOf = (s, t) => smooth(s.collapse, s.collapse + 95, t);

// ──────────────────────────────────────────────────────────── drawing ──

function drawSky(t, ctx) {
  const p = palette(t);
  const out = [];
  out.push(`<rect width="${W}" height="${HORIZON + 40}" fill="url(#sky)"/>`);
  // Stars: the same sky in every slice; dimmed by the city's own light.
  const r = mulberry32(42);
  const starDim = 1 - life(t) * 0.45;
  for (let i = 0; i < 280; i++) {
    const x = r() * W;
    const y = Math.pow(r(), 1.4) * (HORIZON - 30);
    const size = 0.5 + Math.pow(r(), 3) * 1.6;
    const a = (0.25 + r() * 0.75) * starDim * (1 - (y / HORIZON) * 0.6);
    out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(size)}" fill="#dfe8ff" opacity="${a.toFixed(2)}"/>`);
  }
  // Earth: a constant witness, its phase turning slowly between slices.
  const ex = 1268;
  const ey = 176;
  const er = 64;
  const phase = Math.cos(ctx.index * 0.37) * er * 0.9 + er * 0.35;
  out.push(`<circle cx="${ex}" cy="${ey}" r="${er * 1.9}" fill="url(#earthGlow)"/>`);
  out.push(`<circle cx="${ex}" cy="${ey}" r="${er}" fill="#05080f"/>`);
  out.push(
    `<g clip-path="url(#earthClip)"><circle cx="${f(ex - phase)}" cy="${ey}" r="${er}" fill="url(#earthLit)"/>` +
      `<path d="M${ex - 40} ${ey - 20} q 22 -14 40 -4 t 30 10" stroke="#f4f7ff" stroke-width="5" fill="none" opacity=".35"/>` +
      `<path d="M${ex - 50} ${ey + 18} q 30 8 56 -2" stroke="#e8eefc" stroke-width="4" fill="none" opacity=".25"/></g>`,
  );
  out.push(`<circle cx="${ex}" cy="${ey}" r="${er}" fill="none" stroke="#9fc8ff" stroke-width="1.2" opacity=".35"/>`);

  // Crater-rim ridges along the horizon.
  const nFar = noise1(5);
  const nNear = noise1(9);
  const far = [[0, HORIZON + 20]];
  for (let x = 0; x <= W; x += 20) far.push([x, HORIZON - 34 - nFar(x / 140) * 52 - nFar(x / 37) * 10]);
  far.push([W, HORIZON + 20]);
  out.push(`<polygon points="${pts(far)}" fill="${p.ridgeFar}"/>`);
  const near = [[0, HORIZON + 30]];
  for (let x = 0; x <= W; x += 16) near.push([x, HORIZON - 8 - nNear(x / 110 + 3) * 30 - nNear(x / 23) * 5]);
  near.push([W, HORIZON + 30]);
  out.push(`<polygon points="${pts(near)}" fill="${p.ridgeNear}"/>`);
  // Sunlit crests (sun low on the left).
  out.push(
    `<polyline points="${pts(near.slice(1, -1))}" fill="none" stroke="${mixHex(p.ridgeNear, "#d8d2c4", 0.35)}" stroke-width="1.4" opacity=".55"/>`,
  );

  // Ground plane.
  out.push(`<rect y="${HORIZON - 4}" width="${W}" height="${H - HORIZON + 4}" fill="url(#ground)"/>`);
  // Craters, foreshortened by distance.
  const rc = mulberry32(314);
  for (let i = 0; i < 26; i++) {
    const y = HORIZON + 12 + Math.pow(rc(), 1.6) * (H - HORIZON - 20);
    const depth = (y - HORIZON) / (H - HORIZON);
    const x = rc() * W;
    const rx = (10 + rc() * 50) * (0.35 + depth * 1.6);
    const ry = rx * (0.12 + depth * 0.22);
    out.push(
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${p.groundNear}" opacity=".55"/>` +
        `<path d="M${f(x - rx)} ${f(y)} A ${f(rx)} ${f(ry)} 0 0 0 ${f(x + rx)} ${f(y)}" fill="none" stroke="${mixHex(p.groundFar, "#cfc8b8", 0.25)}" stroke-width="${f(0.8 + depth * 1.6)}" opacity=".5"/>`,
    );
  }
  return out.join("\n");
}

function shadow(x, y, w, h, opacity = 0.5) {
  const len = Math.min(380, h * 1.15);
  return `<polygon points="${pts([
    [x - w / 2, y],
    [x + w / 2, y],
    [x + w / 2 + len, y + 9],
    [x - w / 2 + len * 0.9, y + 12],
  ])}" fill="#000" opacity="${opacity}"/>`;
}

function rubble(s, x, y, width, height, p, t) {
  const r = mulberry32(s.seed + 5);
  const out = [];
  const erode = erodeOf(s, t);
  const hh = height * (1 - erode * 0.55);
  const list = [[x - width / 2, y + 2]];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const bump = Math.sin(u * Math.PI);
    list.push([x - width / 2 + u * width, y - bump * hh * (0.55 + r() * 0.6)]);
  }
  list.push([x + width / 2, y + 2]);
  out.push(`<polygon points="${pts(list)}" fill="${p.structShade}"/>`);
  out.push(`<polyline points="${pts(list.slice(1, -1))}" fill="none" stroke="${p.struct}" stroke-width="1" opacity=".45"/>`);
  for (let i = 0; i < 7; i++) {
    const bx = x - width * 0.7 + r() * width * 1.4;
    const bw = 3 + r() * 9;
    out.push(`<rect x="${f(bx)}" y="${f(y - bw * 0.5 + r() * 4)}" width="${f(bw)}" height="${f(bw * 0.5)}" fill="${p.struct}" opacity="${(0.25 + r() * 0.3).toFixed(2)}" transform="rotate(${f(r() * 40 - 20)} ${f(bx)} ${f(y)})"/>`);
  }
  return out.join("");
}

function drawTower(s, t, p, isSpire = false) {
  const out = [];
  const r = mulberry32(s.seed);
  const { x, y, w } = s;
  const fullH = s.h;
  const start = s.built - (isSpire ? 11 : 5);
  if (t < start) return "";
  const lit = life(t);

  if (collapsedOf(s, t)) {
    const stump = fullH * (isSpire ? 0.34 : 0.2) * (1 - erodeOf(s, t) * 0.45);
    const jag = [[x - w / 2, y]];
    jag.push([x - w / 2, y - stump * 0.8], [x - w / 4, y - stump], [x, y - stump * 0.7], [x + w / 5, y - stump * 0.9], [x + w / 2, y - stump * 0.55], [x + w / 2, y]);
    out.push(shadow(x, y, w, stump, 0.4));
    out.push(`<polygon points="${pts(jag)}" fill="${p.structShade}"/>`);
    out.push(`<polygon points="${pts([[x - w / 2, y], [x - w / 2, y - stump * 0.8], [x - w / 4, y - stump], [x - w / 4, y]])}" fill="${p.struct}" opacity=".55"/>`);
    out.push(rubble(s, x + w * 0.4, y, w * 2.8, fullH * 0.09, p, t));
    return out.join("");
  }

  const building = clamp((t - start) / (s.built - start));
  const damage = damageOf(s, t);
  const h = fullH * (0.12 + 0.88 * building) * (1 - damage * 0.34);
  const lean = s.lean * 5.5 * damage * damage;
  const taper = isSpire ? 0.82 : 0.12;
  const topW = w * (1 - taper);

  out.push(shadow(x, y, w, h, 0.45));
  out.push(`<g transform="rotate(${f(lean)} ${f(x)} ${f(y)})">`);

  // Body: tiers with setbacks.
  const tiers = isSpire ? 1 : 2 + Math.floor(r() * 2);
  let base = y;
  let tierW = w;
  const windows = [];
  for (let k = 0; k < tiers; k++) {
    const th = (h / tiers) * (k === 0 ? 1.15 : 0.92);
    const top = Math.max(y - h, base - th);
    const nextW = k === tiers - 1 ? Math.max(topW, tierW * 0.6) : tierW * (0.74 + r() * 0.12);
    const body = [
      [x - tierW / 2, base],
      [x + tierW / 2, base],
      [x + nextW / 2, top],
      [x - nextW / 2, top],
    ];
    out.push(`<polygon points="${pts(body)}" fill="url(#structGrad)"/>`);
    // Sunlit left face.
    out.push(`<polygon points="${pts([body[0], [x - tierW / 6, base], [x - nextW / 6, top], body[3]])}" fill="${p.struct}" opacity=".5"/>`);
    // Facade ribs.
    for (let c = 1; c < 4; c++) {
      const u = c / 4;
      out.push(`<line x1="${f(x - tierW / 2 + tierW * u)}" y1="${f(base)}" x2="${f(x - nextW / 2 + nextW * u)}" y2="${f(top)}" stroke="${p.structShade}" stroke-width=".7" opacity=".6"/>`);
    }
    // Window grid (each window keeps its own threshold forever).
    const rows = Math.floor((base - top) / 7);
    for (let row = 1; row < rows; row++) {
      const yy = base - row * 7;
      const v = (base - yy) / (base - top);
      const rowW = lerp(tierW, nextW, v) * 0.8;
      const cols = Math.max(2, Math.floor(rowW / 5));
      for (let c = 0; c < cols; c++) {
        const th = r();
        windows.push([x - rowW / 2 + (c + 0.5) * (rowW / cols) - 1.1, yy - 1.2, th]);
      }
    }
    base = top;
    tierW = nextW;
    if (top <= y - h + 0.5) break;
  }
  // Windows are batched into a few paths (by brightness) to keep the files small.
  const litPaths = ["", "", ""];
  let dark = "";
  const cell = (wx, wy) => `M${f(wx)} ${f(wy)}h2.2v2.4h-2.2z`;
  for (const [wx, wy, th] of windows) {
    if (th < lit * 0.82) litPaths[Math.min(2, Math.floor(th * 3))] += cell(wx, wy);
    else if (th > 0.6 && building >= 1) dark += cell(wx, wy);
  }
  litPaths.forEach((d, k) => d && out.push(`<path d="${d}" fill="${p.light}" opacity="${(0.62 + k * 0.17).toFixed(2)}"/>`));
  if (dark) out.push(`<path d="${dark}" fill="#05070a" opacity=".55"/>`);

  // Damage: torn top and dark breaches.
  if (damage > 0.02) {
    const rd = mulberry32(s.seed + 11);
    const holes = Math.floor(damage * 7);
    for (let i = 0; i < holes; i++) {
      const hy = y - h * (0.2 + rd() * 0.75);
      const hx = x + (rd() - 0.5) * w * 0.6;
      const hs = 3 + rd() * 9 * damage;
      out.push(`<polygon points="${pts([[hx - hs, hy], [hx - hs * 0.2, hy - hs * 0.8], [hx + hs, hy - hs * 0.2], [hx + hs * 0.3, hy + hs * 0.7]])}" fill="#050505" opacity=".85"/>`);
    }
    const tw = Math.max(topW, w * 0.4);
    out.push(`<polygon points="${pts([[x - tw / 2, y - h + 1], [x - tw / 4, y - h - 6 * damage], [x, y - h + 3], [x + tw / 5, y - h - 9 * damage], [x + tw / 2, y - h + 1]])}" fill="${p.structShade}"/>`);
  }

  // Scaffold while under construction.
  if (building < 1) {
    const sx = w * 0.62;
    for (let k = 0; k <= 8; k++) {
      const yy = y - (fullH * k) / 8;
      out.push(`<line x1="${f(x - sx)}" y1="${f(yy)}" x2="${f(x + sx)}" y2="${f(yy)}" stroke="${p.struct}" stroke-width=".6" opacity=".55"/>`);
    }
    out.push(`<line x1="${f(x - sx)}" y1="${f(y)}" x2="${f(x - sx)}" y2="${f(y - fullH)}" stroke="${p.struct}" stroke-width=".8" opacity=".6"/>`);
    out.push(`<line x1="${f(x + sx)}" y1="${f(y)}" x2="${f(x + sx)}" y2="${f(y - fullH)}" stroke="${p.struct}" stroke-width=".8" opacity=".6"/>`);
    out.push(`<polyline points="${pts([[x + sx, y - fullH - 10], [x + sx, y - fullH - 30], [x - sx - 60, y - fullH - 26]])}" fill="none" stroke="#ffcf6a" stroke-width="1.6" opacity=".75"/>`);
    out.push(`<circle cx="${f(x + sx)}" cy="${f(y - fullH - 30)}" r="2" fill="#ff5a3a"/>`);
  }

  // Antenna, aircraft light, and the spire's long-lived beacon.
  if (building >= 1 && damage < 0.4) {
    const ah = isSpire ? 46 : 12 + r() * 14;
    out.push(`<line x1="${f(x)}" y1="${f(y - h)}" x2="${f(x)}" y2="${f(y - h - ah)}" stroke="${p.struct}" stroke-width="1.1"/>`);
    const beacon = isSpire ? t < BEACON_UNTIL : lit > 0.25;
    if (beacon) {
      out.push(`<circle cx="${f(x)}" cy="${f(y - h - ah)}" r="9" fill="url(#redGlow)"/>`);
      out.push(`<circle cx="${f(x)}" cy="${f(y - h - ah)}" r="2.1" fill="#ff6b4a"/>`);
    }
  }
  if (isSpire && building >= 1 && lit > 0.05) {
    // Crown ring of light near the top.
    out.push(`<rect x="${f(x - topW * 0.62)}" y="${f(y - h * 0.86)}" width="${f(topW * 1.24)}" height="3" fill="${p.light}" opacity="${(0.4 + lit * 0.6).toFixed(2)}"/>`);
    out.push(`<ellipse cx="${f(x)}" cy="${f(y - h * 0.86)}" rx="${f(topW * 3)}" ry="14" fill="url(#warmGlow)" opacity="${(lit * 0.8).toFixed(2)}"/>`);
  }
  out.push(`</g>`);
  return out.join("");
}

function domeCells(s) {
  // Lat/long facets of a hemisphere seen from the side, built once per dome.
  const r = mulberry32(s.seed);
  const lons = 10;
  const lats = 5;
  const cells = [];
  for (let k = 0; k < lons; k++) {
    for (let j = 0; j < lats; j++) {
      cells.push({ k, j, th: r(), shine: r() });
    }
  }
  return { lons, lats, cells };
}

function domePoint(s, lon, lat) {
  return [s.x + s.r * Math.cos(lat) * Math.sin(lon), s.y - s.r * Math.sin(lat)];
}

function drawDome(s, t, p) {
  if (t < s.built - 4) return "";
  const out = [];
  const building = clamp((t - (s.built - 4)) / 4);
  const damage = damageOf(s, t);
  const collapsed = collapsedOf(s, t);
  const lit = life(t);
  const { lons, lats, cells } = domeCells(s);
  const lonAt = (k) => -Math.PI / 2 + (Math.PI * k) / lons;
  const latAt = (j) => (Math.PI / 2) * (j / lats) * 0.999;

  out.push(shadow(s.x, s.y, s.r * 2, s.r * 0.8, 0.45));

  if (!collapsed) {
    // Interior: warm light, hydroponic green, and later bare darkness.
    out.push(`<path d="M${f(s.x - s.r)} ${f(s.y)} A ${f(s.r)} ${f(s.r)} 0 0 1 ${f(s.x + s.r)} ${f(s.y)} Z" fill="#06080b" opacity="${(0.55 * building).toFixed(2)}"/>`);
    if (lit > 0.02 && building >= 1) {
      out.push(`<ellipse cx="${f(s.x)}" cy="${f(s.y - s.r * 0.15)}" rx="${f(s.r * 0.95)}" ry="${f(s.r * 0.7)}" fill="url(#warmGlow)" opacity="${(lit * 0.9).toFixed(2)}"/>`);
      const rg = mulberry32(s.seed + 3);
      for (let i = 0; i < 9; i++) {
        const gx = s.x + (rg() - 0.5) * s.r * 1.4;
        const gr = s.r * (0.08 + rg() * 0.12);
        out.push(`<ellipse cx="${f(gx)}" cy="${f(s.y - gr * 0.4)}" rx="${f(gr)}" ry="${f(gr * 0.6)}" fill="#3c7a52" opacity="${(lit * 0.75).toFixed(2)}"/>`);
      }
      // A few lit interior structures.
      for (let i = 0; i < 5; i++) {
        const bx = s.x + (rg() - 0.5) * s.r * 1.2;
        const bh = s.r * (0.15 + rg() * 0.35);
        out.push(`<rect x="${f(bx)}" y="${f(s.y - bh)}" width="${f(s.r * 0.08)}" height="${f(bh)}" fill="${p.struct}" opacity=".35"/>`);
        out.push(`<rect x="${f(bx + 1)}" y="${f(s.y - bh + 3)}" width="2" height="2" fill="${p.light}" opacity="${lit.toFixed(2)}"/>`);
      }
    }
    // Glass facets.
    for (const c of cells) {
      if (c.j / lats > building) continue;
      if (c.th < damage * 1.08) continue;
      const lon0 = lonAt(c.k);
      const lon1 = lonAt(c.k + 1);
      const lat0 = latAt(c.j);
      const lat1 = latAt(c.j + 1);
      const poly = [];
      for (let i = 0; i <= 3; i++) poly.push(domePoint(s, lon0, lerp(lat0, lat1, i / 3)));
      for (let i = 3; i >= 0; i--) poly.push(domePoint(s, lon1, lerp(lat0, lat1, i / 3)));
      const sunSide = 1 - c.k / lons;
      const a = (0.12 + sunSide * 0.22 + c.shine * 0.12) * (1 - decay(t) * 0.4);
      out.push(`<polygon points="${pts(poly)}" fill="${p.glass}" opacity="${a.toFixed(2)}"/>`);
      if (c.shine > 0.86 && damage < 0.5) out.push(`<polygon points="${pts(poly)}" fill="#ffffff" opacity=".18"/>`);
    }
    // Ribs: meridians and latitude rings.
    const rr = mulberry32(s.seed + 9);
    for (let k = 0; k <= lons; k++) {
      const lon = lonAt(k);
      const broken = damage > 0.35 + rr() * 0.6;
      const top = broken ? latAt(Math.floor(lats * (0.3 + rr() * 0.4))) : Math.PI / 2 * building;
      const line = [];
      for (let i = 0; i <= 12; i++) line.push(domePoint(s, lon, (top * i) / 12));
      out.push(`<polyline points="${pts(line)}" fill="none" stroke="${p.struct}" stroke-width="${f(0.6 + s.r / 110)}" opacity=".75"/>`);
    }
    for (let j = 1; j <= lats; j++) {
      if (j / lats > building) break;
      const lat = latAt(j);
      const yy = s.y - s.r * Math.sin(lat);
      const half = s.r * Math.cos(lat);
      if (damage > 0.55 && rr() < damage) continue;
      out.push(`<line x1="${f(s.x - half)}" y1="${f(yy)}" x2="${f(s.x + half)}" y2="${f(yy)}" stroke="${p.struct}" stroke-width=".7" opacity=".55"/>`);
    }
    // Outline and base ring.
    out.push(`<path d="M${f(s.x - s.r)} ${f(s.y)} A ${f(s.r)} ${f(s.r)} 0 0 1 ${f(s.x + s.r)} ${f(s.y)}" fill="none" stroke="${mixHex(p.struct, "#ffffff", 0.2)}" stroke-width="1.4" opacity="${(0.7 * (1 - damage * 0.7) * building).toFixed(2)}"/>`);
    out.push(`<rect x="${f(s.x - s.r - 4)}" y="${f(s.y - 4)}" width="${f(s.r * 2 + 8)}" height="7" fill="${p.structShade}"/>`);
    if (lit > 0.1) {
      for (let i = 0; i < 9; i++) {
        out.push(`<circle cx="${f(s.x - s.r + (i + 0.5) * ((s.r * 2) / 9))}" cy="${f(s.y - 0.5)}" r="1.4" fill="${p.light}" opacity="${lit.toFixed(2)}"/>`);
      }
    }
  } else {
    // A few surviving ribs, then only rubble.
    const erode = erodeOf(s, t);
    const rr = mulberry32(s.seed + 21);
    for (let k = 1; k < lons; k += 2) {
      if (rr() < 0.35 + erode * 0.6) continue;
      const lon = lonAt(k);
      const top = latAt(lats) * (0.25 + rr() * 0.35) * (1 - erode * 0.6);
      const line = [];
      for (let i = 0; i <= 8; i++) line.push(domePoint(s, lon, (top * i) / 8));
      out.push(`<polyline points="${pts(line)}" fill="none" stroke="${p.struct}" stroke-width="${f(0.8 + s.r / 120)}" opacity=".6"/>`);
    }
    out.push(rubble(s, s.x, s.y, s.r * 2.1, s.r * 0.2, p, t));
  }
  return out.join("");
}

function drawModule(s, t, p) {
  if (t < s.built) return "";
  const out = [];
  const lit = life(t);
  const damage = damageOf(s, t);
  const h = 22;
  if (collapsedOf(s, t)) return rubble(s, s.x, s.y, s.len, 10, p, t);
  out.push(shadow(s.x, s.y, s.len, 30, 0.35));
  out.push(`<rect x="${f(s.x - s.len / 2)}" y="${f(s.y - h)}" width="${f(s.len)}" height="${h}" rx="11" fill="url(#structGrad)"/>`);
  out.push(`<rect x="${f(s.x - s.len / 2)}" y="${f(s.y - h)}" width="${f(s.len)}" height="7" rx="3.5" fill="${p.struct}" opacity=".45"/>`);
  // Regolith shielding heaped over the top.
  out.push(`<path d="M${f(s.x - s.len / 2 - 8)} ${f(s.y)} Q ${f(s.x)} ${f(s.y - h - 14)} ${f(s.x + s.len / 2 + 8)} ${f(s.y)} Z" fill="${p.groundFar}" opacity=".55"/>`);
  const r = mulberry32(s.seed);
  const ports = Math.floor(s.len / 16);
  for (let i = 0; i < ports; i++) {
    const th = r();
    const px = s.x - s.len / 2 + (i + 0.5) * (s.len / ports);
    const on = th < lit * 0.9;
    out.push(`<circle cx="${f(px)}" cy="${f(s.y - h / 2 + 2)}" r="2.6" fill="${on ? p.light : "#07090c"}" opacity="${on ? 0.95 : 0.6}"/>`);
  }
  if (damage > 0.2) {
    out.push(`<path d="M${f(s.x - s.len * 0.2)} ${f(s.y - h)} l 8 9 l -5 5 l 9 8" stroke="#050505" stroke-width="2" fill="none" opacity="${damage.toFixed(2)}"/>`);
  }
  return out.join("");
}

function drawSolar(s, t, p) {
  if (t < s.built) return "";
  const out = [];
  const r = mulberry32(s.seed);
  const damage = damageOf(s, t);
  const collapsed = collapsedOf(s, t);
  const dustTone = decay(t);
  for (let c = 0; c < s.cols; c++) {
    const th = r();
    const missing = collapsed ? th < 0.75 + erodeOf(s, t) * 0.25 : th < damage * 0.8;
    const x = s.x + c * 44;
    const y = s.y + (c % 2) * 6;
    if (missing) {
      out.push(`<line x1="${f(x + 18)}" y1="${f(y)}" x2="${f(x + 22)}" y2="${f(y - 10)}" stroke="${p.structShade}" stroke-width="1.5"/>`);
      continue;
    }
    const panel = [[x, y - 8], [x + 38, y - 8], [x + 46, y - 22], [x + 8, y - 22]];
    const fill = mixHex("#1b2f52", "#55524a", dustTone);
    out.push(`<line x1="${f(x + 20)}" y1="${f(y)}" x2="${f(x + 22)}" y2="${f(y - 14)}" stroke="${p.structShade}" stroke-width="2"/>`);
    out.push(`<polygon points="${pts(panel)}" fill="${fill}" stroke="${p.struct}" stroke-width=".6" stroke-opacity=".6"/>`);
    out.push(`<line x1="${f(x + 19)}" y1="${f(y - 8)}" x2="${f(x + 27)}" y2="${f(y - 22)}" stroke="${p.struct}" stroke-width=".4" opacity=".5"/>`);
    out.push(`<line x1="${f(x + 4)}" y1="${f(y - 15)}" x2="${f(x + 42)}" y2="${f(y - 15)}" stroke="${p.struct}" stroke-width=".4" opacity=".5"/>`);
    if (dustTone < 0.3) out.push(`<polygon points="${pts([[x + 10, y - 8], [x + 16, y - 8], [x + 24, y - 22], [x + 18, y - 22]])}" fill="#a9c9ff" opacity=".18"/>`);
  }
  return out.join("");
}

function drawDish(s, t, p) {
  if (t < s.built) return "";
  const damage = damageOf(s, t);
  if (collapsedOf(s, t)) {
    return `<ellipse cx="${f(s.x + 18)}" cy="${f(s.y - 4)}" rx="${f(s.r)}" ry="${f(s.r * 0.3)}" fill="${p.structShade}" transform="rotate(12 ${f(s.x)} ${f(s.y)})"/>` + rubble(s, s.x, s.y, 40, 6, p, t);
  }
  const tilt = -25 + damage * 70;
  const out = [shadow(s.x, s.y, 10, 60, 0.35)];
  out.push(`<line x1="${f(s.x)}" y1="${f(s.y)}" x2="${f(s.x)}" y2="${f(s.y - 38)}" stroke="${p.struct}" stroke-width="3"/>`);
  out.push(`<g transform="rotate(${f(tilt)} ${f(s.x)} ${f(s.y - 40)})">`);
  out.push(`<path d="M${f(s.x - s.r)} ${f(s.y - 40)} Q ${f(s.x)} ${f(s.y - 40 + s.r * 0.9)} ${f(s.x + s.r)} ${f(s.y - 40)} Z" fill="url(#structGrad)" stroke="${p.struct}" stroke-width="1"/>`);
  out.push(`<line x1="${f(s.x)}" y1="${f(s.y - 30)}" x2="${f(s.x)}" y2="${f(s.y - 64)}" stroke="${p.struct}" stroke-width="1"/>`);
  if (life(t) > 0.3) out.push(`<circle cx="${f(s.x)}" cy="${f(s.y - 64)}" r="2" fill="#9fe1ff"/>`);
  out.push(`</g>`);
  return out.join("");
}

function drawTubes(t, p) {
  const out = [];
  const byX = new Map(STRUCTURES.filter((s) => s.type === "dome").map((s) => [s.x, s]));
  TUBES.forEach(([a, b, built], i) => {
    if (t < built) return;
    const A = byX.get(a);
    const B = byX.get(b);
    const y = Math.max(A.y, B.y) - 6;
    const x0 = a < b ? A.x + A.r : A.x - A.r;
    const x1 = a < b ? B.x - B.r : B.x + B.r;
    const failed = Math.min(A.collapse, B.collapse) - 20;
    const dmg = smooth(failed - 40, failed + 30, t);
    const r = mulberry32(900 + i);
    const segs = 6;
    for (let k = 0; k < segs; k++) {
      if (r() < dmg) continue;
      const u0 = k / segs;
      const u1 = (k + 0.92) / segs;
      out.push(`<line x1="${f(lerp(x0, x1, u0))}" y1="${f(y)}" x2="${f(lerp(x0, x1, u1))}" y2="${f(y)}" stroke="${p.struct}" stroke-width="9" stroke-linecap="round" opacity=".65"/>`);
      out.push(`<line x1="${f(lerp(x0, x1, u0))}" y1="${f(y - 2)}" x2="${f(lerp(x0, x1, u1))}" y2="${f(y - 2)}" stroke="${mixHex(p.struct, "#ffffff", 0.3)}" stroke-width="2" stroke-linecap="round" opacity=".5"/>`);
      if (life(t) > 0.2) out.push(`<circle cx="${f(lerp(x0, x1, (u0 + u1) / 2))}" cy="${f(y)}" r="1.4" fill="${p.light}" opacity="${life(t).toFixed(2)}"/>`);
    }
  });
  return out.join("");
}

function drawDriver(t, p) {
  const { from, to, built, quiet, collapse } = DRIVER;
  if (t < built - 5) return "";
  const out = [];
  const progress = clamp((t - (built - 5)) / 5);
  const dmg = smooth(collapse - 60, collapse + 40, t);
  const r = mulberry32(4242);
  const n = 18;
  for (let k = 0; k < n; k++) {
    const u0 = k / n;
    if (u0 > progress) break;
    const gone = r() < dmg * 1.1;
    const x0 = lerp(from[0], to[0], u0);
    const y0 = lerp(from[1], to[1], u0);
    const x1 = lerp(from[0], to[0], (k + 1) / n);
    const y1 = lerp(from[1], to[1], (k + 1) / n);
    // Pylons stay longer than the rail.
    const ground = HORIZON + 30 + (1 - u0) * 40;
    if (!gone || r() > 0.5) out.push(`<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x0)}" y2="${f(ground)}" stroke="${p.structShade}" stroke-width="2"/>`);
    if (!gone) {
      out.push(`<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${p.struct}" stroke-width="3" opacity=".8"/>`);
      if (life(t) > 0.2) out.push(`<circle cx="${f(x0)}" cy="${f(y0 - 2)}" r="1.3" fill="#9fd4ff" opacity="${life(t).toFixed(2)}"/>`);
    }
  }
  if (t >= built && t < quiet) {
    // A capsule mid-launch: a streak of light along the rail.
    const u = 0.35 + ((t * 7.31) % 1) * 0.5;
    const cx = lerp(from[0], to[0], u);
    const cy = lerp(from[1], to[1], u);
    const dx = (to[0] - from[0]) * 0.08;
    const dy = (to[1] - from[1]) * 0.08;
    out.push(`<line x1="${f(cx - dx)}" y1="${f(cy - dy - 3)}" x2="${f(cx)}" y2="${f(cy - 3)}" stroke="#bfe6ff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>`);
    out.push(`<circle cx="${f(cx)}" cy="${f(cy - 3)}" r="10" fill="url(#coolGlow)"/>`);
  }
  return out.join("");
}

function drawPadAndShip(t, p) {
  if (t < PAD.built) return "";
  const out = [];
  const lit = life(t);
  const d = decay(t);
  out.push(`<ellipse cx="${PAD.x}" cy="${PAD.y}" rx="${PAD.rx}" ry="${PAD.rx * 0.16}" fill="${mixHex("#30343c", p.dune, d)}" opacity="${(1 - erasure(t)).toFixed(2)}"/>`);
  out.push(`<ellipse cx="${PAD.x}" cy="${PAD.y}" rx="${PAD.rx * 0.7}" ry="${PAD.rx * 0.11}" fill="none" stroke="${p.struct}" stroke-width="1" opacity="${(0.5 * (1 - d)).toFixed(2)}"/>`);
  if (lit > 0.05) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      out.push(`<circle cx="${f(PAD.x + Math.cos(a) * PAD.rx * 0.92)}" cy="${f(PAD.y + Math.sin(a) * PAD.rx * 0.15)}" r="1.6" fill="#ffb35c" opacity="${lit.toFixed(2)}"/>`);
    }
  }
  if (t >= SHIP.arrive && t < SHIP.depart) {
    const sx = PAD.x;
    const sy = PAD.y - 4;
    const departing = smooth(SHIP.depart - 3, SHIP.depart, t);
    const lift = departing * 26;
    out.push(shadow(sx, PAD.y, 30, 70, 0.4));
    out.push(`<g transform="translate(0 ${f(-lift)})">`);
    out.push(`<polygon points="${pts([[sx - 13, sy - 10], [sx + 13, sy - 10], [sx + 9, sy - 70], [sx, sy - 88], [sx - 9, sy - 70]])}" fill="url(#structGrad)"/>`);
    out.push(`<polygon points="${pts([[sx - 13, sy - 10], [sx - 4, sy - 10], [sx - 3, sy - 76], [sx - 9, sy - 70]])}" fill="${p.struct}" opacity=".6"/>`);
    out.push(`<polyline points="${pts([[sx - 22, sy + 2], [sx - 12, sy - 16]])}" stroke="${p.struct}" stroke-width="2"/>`);
    out.push(`<polyline points="${pts([[sx + 22, sy + 2], [sx + 12, sy - 16]])}" stroke="${p.struct}" stroke-width="2"/>`);
    out.push(`<circle cx="${sx}" cy="${sy - 54}" r="2.4" fill="${p.light}"/>`);
    if (departing > 0.01) {
      out.push(`<ellipse cx="${sx}" cy="${sy + 2}" rx="${f(10 + departing * 6)}" ry="${f(18 + departing * 30)}" fill="url(#plume)"/>`);
    }
    out.push(`</g>`);
  }
  return out.join("");
}

function drawTraffic(t) {
  const amount = life(t) * smooth(2052, 2070, t);
  if (amount < 0.05) return "";
  const out = [];
  const r = mulberry32(Math.floor(t * 13));
  const count = Math.floor(amount * 9);
  for (let i = 0; i < count; i++) {
    const x = 200 + r() * 1200;
    const y = 240 + r() * 300;
    const len = 18 + r() * 40;
    const dir = r() < 0.5 ? -1 : 1;
    out.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + len * dir)}" y2="${f(y + len * 0.18)}" stroke="#ffe7c2" stroke-width="1.1" stroke-linecap="round" opacity="${(0.25 + r() * 0.4).toFixed(2)}"/>`);
    out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="#fff4e0"/>`);
  }
  return out.join("");
}

function drawVegetation(t, p) {
  const g = growth(t);
  if (g < 0.01) return "";
  const dry = dryness(t);
  const fade = 1 - erasure(t) * 0.9;
  const leaf = mixHex("#2f6a55", "#5d503d", dry);
  const leafHi = mixHex("#58a07a", "#7b6b4f", dry);
  const out = [];
  const hosts = STRUCTURES.filter((s) => (s.type === "dome" || s.type === "tower") && t >= s.built);
  for (const s of hosts) {
    const r = mulberry32(s.seed + 33);
    const span = s.type === "dome" ? s.r : s.w;
    const height = s.type === "dome" ? s.r * 0.9 : s.h * 0.45;
    const n = s.type === "dome" ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const bx = s.x + (r() - 0.5) * span * 1.8;
      const len = height * g * (0.4 + r() * 0.8);
      const sway = (r() - 0.5) * 30;
      const w = 1.4 + r() * 2.6;
      out.push(`<path d="M${f(bx)} ${f(s.y)} q ${f(sway)} ${f(-len * 0.5)} ${f(sway * 0.3)} ${f(-len)}" stroke="${leaf}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" opacity="${(0.85 * fade).toFixed(2)}"/>`);
      for (let k = 0; k < 4; k++) {
        const u = 0.25 + k * 0.2;
        const lx = bx + sway * u * (1 - u) * 1.6;
        const ly = s.y - len * u;
        out.push(`<ellipse cx="${f(lx)}" cy="${f(ly)}" rx="${f(3 + r() * 5 * g)}" ry="${f(2 + r() * 2)}" fill="${k % 2 ? leaf : leafHi}" opacity="${(0.7 * fade).toFixed(2)}"/>`);
      }
    }
    // Ground mats around each host.
    for (let i = 0; i < 4; i++) {
      const mx = s.x + (r() - 0.5) * span * 2.4;
      out.push(`<ellipse cx="${f(mx)}" cy="${f(s.y + 2)}" rx="${f(span * 0.3 * g + 6)}" ry="${f(4 + 3 * g)}" fill="${leaf}" opacity="${(0.7 * fade).toFixed(2)}"/>`);
    }
    // Faint bioluminescence while it lives.
    if (dry < 0.6) {
      for (let i = 0; i < 6; i++) {
        const lx = s.x + (r() - 0.5) * span * 1.8;
        const ly = s.y - r() * height * g;
        out.push(`<circle cx="${f(lx)}" cy="${f(ly)}" r="1.3" fill="#8affd2" opacity="${(0.7 * g * (1 - dry) * fade).toFixed(2)}"/>`);
      }
    }
  }
  return out.join("");
}

function duneBand(t, p, seed, baseY, amplitude, scale, color, hi) {
  const n = noise1(seed);
  const top = [];
  for (let x = -20; x <= W + 20; x += 20) {
    const y = baseY - amplitude * (0.55 + 0.45 * n(x / scale + seed)) - 12 * n(x / 45 + 2);
    top.push([x, y]);
  }
  const poly = [[-20, H + 10], ...top, [W + 20, H + 10]];
  const out = [`<polygon points="${pts(poly)}" fill="${color}"/>`];
  out.push(`<polyline points="${pts(top)}" fill="none" stroke="${hi}" stroke-width="1.6" opacity=".55"/>`);
  // Wind ripples.
  for (let k = 1; k <= 3; k++) {
    out.push(`<polyline points="${pts(top.map(([x, y]) => [x, y + k * 9 + 4 * Math.sin(x / 60 + k)]))}" fill="none" stroke="${hi}" stroke-width=".7" opacity="${(0.25 / k).toFixed(2)}"/>`);
  }
  return out.join("");
}

function drawCityLayer(t, p) {
  const out = [];
  // Ground-level road lights between the domes.
  const lit = life(t);
  if (lit > 0.05) {
    for (let x = 120; x < 1480; x += 26) {
      out.push(`<circle cx="${x}" cy="${f(735 + Math.sin(x / 90) * 6)}" r="1.3" fill="${p.light}" opacity="${(lit * 0.7).toFixed(2)}"/>`);
    }
  }
  out.push(drawDriver(t, p));
  const order = [...STRUCTURES].sort((a, b) => a.y - b.y);
  for (const s of order) {
    if (s.type === "dome") out.push(drawDome(s, t, p));
    else if (s.type === "tower") out.push(drawTower(s, t, p));
    else if (s.type === "spire") out.push(drawTower(s, t, p, true));
    else if (s.type === "module") out.push(drawModule(s, t, p));
    else if (s.type === "solar") out.push(drawSolar(s, t, p));
    else if (s.type === "dish") out.push(drawDish(s, t, p));
  }
  out.push(drawTubes(t, p));
  out.push(drawPadAndShip(t, p));
  out.push(drawTraffic(t));
  out.push(drawVegetation(t, p));
  // Rear dunes start swallowing the city's base.
  const rise = dustHeight(t);
  if (rise > 30) out.push(duneBand(t, p, 17, 760 + (1 - smooth(30, 300, rise)) * 120, rise * 0.32, 160, mixHex(p.dune, p.groundFar, 0.35), p.duneHi));
  return out.join("\n");
}

function drawForegroundLayer(t, p) {
  const out = [];
  // Boulders that have always been there.
  const r = mulberry32(2718);
  const rocks = [
    [70, 960, 120],
    [220, 1000, 80],
    [1480, 975, 140],
    [1330, 1010, 70],
    [640, 1012, 50],
  ];
  for (const [x, y, s] of rocks) {
    const poly = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      const rr = s * (0.7 + r() * 0.35);
      poly.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]);
    }
    out.push(`<polygon points="${pts(poly)}" fill="${p.groundNear}"/>`);
    out.push(`<polyline points="${pts(poly.slice(0, 6))}" fill="none" stroke="${mixHex(p.groundFar, "#e8e0cc", 0.3)}" stroke-width="2" opacity=".5"/>`);
  }
  // Dunes rolling in from the foreground.
  const rise = dustHeight(t);
  out.push(duneBand(t, p, 3, H + 16, rise, 220, p.dune, p.duneHi));
  if (rise > 120) out.push(duneBand(t, p, 29, H + 40, rise * 0.62, 300, mixHex(p.dune, "#000000", 0.12), p.duneHi));
  // Atmospheric dust haze and a pale band along the horizon.
  out.push(`<rect width="${W}" height="${H}" fill="${p.haze}" opacity="${p.hazeA.toFixed(3)}"/>`);
  out.push(`<rect y="${HORIZON - 120}" width="${W}" height="240" fill="url(#horizonDust)" opacity="${(decay(t) * 0.8).toFixed(2)}"/>`);
  return out.join("\n");
}

function defs(t, p) {
  return `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyTop}"/><stop offset="1" stop-color="${p.skyLow}"/></linearGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.groundFar}"/><stop offset="1" stop-color="${p.groundNear}"/></linearGradient>
<linearGradient id="structGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.struct}"/><stop offset=".55" stop-color="${mixHex(p.struct, p.structShade, 0.6)}"/><stop offset="1" stop-color="${p.structShade}"/></linearGradient>
<radialGradient id="earthLit" cx=".35" cy=".4" r=".7"><stop offset="0" stop-color="#e8f2ff"/><stop offset=".45" stop-color="#5b93d8"/><stop offset="1" stop-color="#1b3e78"/></radialGradient>
<radialGradient id="earthGlow"><stop offset=".5" stop-color="#6aa8ff" stop-opacity=".22"/><stop offset="1" stop-color="#6aa8ff" stop-opacity="0"/></radialGradient>
<radialGradient id="warmGlow"><stop offset="0" stop-color="${p.light}" stop-opacity=".75"/><stop offset="1" stop-color="${p.light}" stop-opacity="0"/></radialGradient>
<radialGradient id="redGlow"><stop offset="0" stop-color="#ff5a3a" stop-opacity=".7"/><stop offset="1" stop-color="#ff5a3a" stop-opacity="0"/></radialGradient>
<radialGradient id="coolGlow"><stop offset="0" stop-color="#bfe6ff" stop-opacity=".8"/><stop offset="1" stop-color="#bfe6ff" stop-opacity="0"/></radialGradient>
<radialGradient id="plume" cx=".5" cy=".2"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".4" stop-color="#9fd4ff" stop-opacity=".5"/><stop offset="1" stop-color="#9fd4ff" stop-opacity="0"/></radialGradient>
<linearGradient id="horizonDust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.haze}" stop-opacity="0"/><stop offset=".5" stop-color="${p.haze}" stop-opacity=".55"/><stop offset="1" stop-color="${p.haze}" stop-opacity="0"/></linearGradient>
<clipPath id="earthClip"><circle cx="1268" cy="176" r="64"/></clipPath>
</defs>`;
}

function svg(content, t, p, opaque) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs(t, p)}
${opaque ? `<rect width="${W}" height="${H}" fill="${p.skyTop}"/>` : ""}
${content}
</svg>
`;
}

// ─────────────────────────────────────────────────────── the archive ──

const MOMENTS = [
  ["2031-03-14", "Foundation", "First Pressure Dome", "A single dome holds air on the floor of the mare. Eleven people sleep beneath it."],
  ["2036-08-02", "Foundation", "Buried Habitats", "Living modules are heaped with regolith against radiation. Greenhouse lamps burn through the fourteen-day night."],
  ["2041-11-27", "Foundation", "The Landing Field", "A cargo lander rests on the new pad. The communications dish turns toward Earth."],
  ["2046-05-09", "Active Settlement", "Second Dome", "An eastern dome rises, linked by a pressurised tunnel. The settlement now feeds itself."],
  ["2051-01-18", "Active Settlement", "Scaffolds", "The first tower climbs out of a lattice of scaffolding. Cranes work without pause in the low gravity."],
  ["2056-07-30", "Active Settlement", "Vertical City", "Towers stand among the domes. Windows have begun to outnumber stars on the horizon."],
  ["2061-04-03", "Expansion", "The Mass Driver", "A magnetic rail runs toward the horizon, throwing refined ore into orbit every eleven minutes."],
  ["2066-10-21", "Expansion", "Night Traffic", "Shuttles stitch light across the sky. The western dome is complete."],
  ["2071-02-12", "Expansion", "Ring of Domes", "Outlying domes join the network. Tunnels connect every pressurised volume."],
  ["2076-09-05", "Expansion", "Density", "Every tower is occupied. New construction moves to the crater rim."],
  ["2081-06-19", "Peak Development", "The Long Day", "Population passes two hundred thousand. Lit windows trace every floor."],
  ["2086-12-01", "Peak Development", "The Spire", "Foundations for the central spire are cut beneath the old Prime Dome."],
  ["2092-03-23", "Peak Development", "Zenith", "The settlement's light is visible from Earth with the naked eye."],
  ["2097-08-14", "Peak Development", "Completion", "The spire is finished. Its crown is lit for the first time."],
  ["2103-05-06", "Peak Development", "Stillness", "Nothing new is begun. The city runs at the limit of what it can sustain."],
  ["2109-11-11", "Decline", "Fewer Lights", "Whole floors are sealed and depressurised to save air. The outer towers dim first."],
  ["2115-02-28", "Decline", "Quiet Corridors", "Traffic thins. Shuttles depart full and return empty."],
  ["2121-07-17", "Decline", "The Rail Falls Silent", "The mass driver fires its last capsule. Orbit no longer needs what the Moon can give."],
  ["2127-10-09", "Decline", "Consolidation", "Residents are moved into the Prime Dome. Outer volumes are left to the vacuum."],
  ["2133-04-25", "First Signs of Abandonment", "Last Departures", "Evacuation flights leave every few weeks. Most windows are dark."],
  ["2139-09-02", "First Signs of Abandonment", "The Final Ship", "One lander remains on the pad, waiting for its last passengers."],
  ["2145-12-24", "Abandoned City", "Dark Windows", "The pad is empty. Only the spire's beacon still pulses, powered by a reactor no one tends."],
  ["2152-06-12", "Abandoned City", "Thermal Fatigue", "Two hundred-degree swings between day and night begin to open seams in the glass."],
  ["2159-01-30", "Abandoned City", "Micrometeorites", "Small impacts accumulate. The outer domes lose their first panels."],
  ["2166-08-08", "Damaged Infrastructure", "First Breach", "A tower leans. The eastern dome vents what little atmosphere it held."],
  ["2174-06-12", "Damaged Infrastructure", "Settling", "Dust drifts against the southern walls. The communications dish tilts toward the ground."],
  ["2182-03-03", "Damaged Infrastructure", "Broken Towers", "The outermost towers shed their upper floors. The dish has fallen."],
  ["2191-10-15", "Major Decay", "The Beacon Fails", "The spire's light goes out after ninety years of signalling to no one."],
  ["2200-05-20", "Major Decay", "Skeletons", "The small domes are reduced to their ribs. Solar fields are buried in grey."],
  ["2210-12-07", "Major Decay", "Collapse of the East", "The eastern dome falls in. Its tunnel lies in pieces across the regolith."],
  ["2221-07-01", "Vegetation and Dust", "Escaped Gardens", "In the sheltered ruins, engineered hydroponic strains outlive their keepers and climb the walls."],
  ["2232-02-14", "Vegetation and Dust", "Overgrowth", "Faint bioluminescent growth threads through the broken western dome."],
  ["2244-09-29", "Vegetation and Dust", "Strange Spring", "The gardens reach their furthest extent, rooted in condensate trapped beneath the rubble."],
  ["2256-04-18", "Structural Collapse", "The Prime Dome Falls", "The oldest structure in the settlement collapses into its own foundations."],
  ["2268-11-05", "Structural Collapse", "Drying", "The growth withers as the last trapped water is exhausted."],
  ["2281-06-22", "Ruins", "Ruins", "Only the spire and a few tower stumps rise above the dunes."],
  ["2295-01-09", "Ruins", "Drifts", "Regolith, stirred by ten thousand small impacts, settles over everything."],
  ["2310-08-30", "Ruins", "The Last Tower", "The spire still stands, alone, its crown long gone."],
  ["2328-03-16", "Almost Erased", "Erasure", "The spire has fallen. Shapes under the dust are the only evidence of a city."],
  ["2351-10-04", "Almost Erased", "Almost Nothing", "A shallow hollow in the mare, and Earth in the same place in the sky."],
];

function decimalYear(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (Date.UTC(y, m - 1, d) - start) / (end - start);
}

function population(t) {
  if (t < 2032) return 11;
  if (t >= SHIP.depart) return 0;
  const peak = 212400;
  const rise = smooth(2031, 2084, t);
  const fall = 1 - smooth(2102, 2140, t);
  return Math.max(0, Math.round((peak * Math.pow(rise, 1.6) * fall) / 10) * 10 + (t < 2140 ? 11 : 0));
}

function attributes(t) {
  const pop = population(t);
  const integrity = Math.max(0.3, 100 * (1 - decay(t) * 0.995) * (1 - erasure(t) * 0.6));
  const dustCm = (dustHeight(t) - 6) * 1.25 + 0.2;
  const signal = life(t) > 0.15 ? "Settlement network" : t < BEACON_UNTIL ? "Beacon only" : "No signal";
  return {
    Population: pop.toLocaleString("en-US"),
    "Structural integrity": `${integrity.toFixed(integrity < 10 ? 1 : 0)}%`,
    "Regolith cover": dustCm < 100 ? `${dustCm.toFixed(1)} cm` : `${(dustCm / 100).toFixed(2)} m`,
    Signal: signal,
  };
}

function main() {
  mkdirSync(IMAGE_DIR, { recursive: true });
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  for (const file of readdirSync(IMAGE_DIR)) if (file.endsWith(".svg")) rmSync(join(IMAGE_DIR, file));

  const slices = MOMENTS.map(([date, phase, title, description], index) => {
    const t = decimalYear(date);
    const p = palette(t);
    const ctx = { index };
    const sky = drawSky(t, ctx);
    // The settlement is drawn at its own scale around its centre so it reads at slice size.
    const city = `<g transform="translate(800 712) scale(1.2) translate(-800 -712)">${drawCityLayer(t, p)}</g>`;
    const fore = drawForegroundLayer(t, p);
    const id = `slice-${String(index + 1).padStart(2, "0")}`;
    writeFileSync(join(IMAGE_DIR, `${id}.svg`), svg(`${sky}\n${city}\n${fore}`, t, p, true));
    writeFileSync(join(IMAGE_DIR, `${id}-l0.svg`), svg(sky, t, p, true));
    writeFileSync(join(IMAGE_DIR, `${id}-l1.svg`), svg(city, t, p, false));
    writeFileSync(join(IMAGE_DIR, `${id}-l2.svg`), svg(fore, t, p, false));
    return {
      id,
      time: Number(t.toFixed(4)),
      timeLabel: date.replaceAll("-", "."),
      title,
      description,
      phase,
      image: `${PUBLIC_PREFIX}/${id}.svg`,
      layers: [0, 1, 2].map((k) => `${PUBLIC_PREFIX}/${id}-l${k}.svg`),
      attributes: attributes(t),
    };
  });

  const dataset = {
    id: "lunar-city",
    title: "Lunar Archive",
    subtitle: "Mare Serenitatis Settlement",
    description:
      "A fictional settlement on the Moon, observed at forty moments across three centuries: founded, crowded, abandoned, overgrown and finally buried.",
    timeUnit: "year",
    aspect: W / H,
    slices,
  };
  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`Generated ${slices.length} slices → ${IMAGE_DIR}`);
}

main();

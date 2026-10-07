import { describe, expect, it } from "vitest";
import {
  computeLOD,
  containDistance,
  coverDistance,
  createTemporalStore,
  createVolumeLayout,
  dominantMoment,
  enterCameraPose,
  EXTRACT,
  fieldPhase,
  formatDecimalYear,
  hermite,
  initialState,
  labelForTime,
  MEMBRANE_DISTANCE,
  momentPhase,
  momentPosition,
  normalizeDataset,
  phaseSegments,
  pickSlice,
  rayHitsSlice,
  reduce,
  sampleSlices,
  separation,
  sliceForMoment,
  sliceLabel,
  slicePose,
  sliceTime,
  Spring,
  stepMoment,
  SWAP_POINT,
  TemporalDatasetError,
  TemporalNavigation,
  TemporalWaves,
  vec3,
} from "../src/engine";
import { drawOrder } from "../src/volume/TemporalVolumeGeometry";

const tiny = {
  id: "t",
  title: "Test",
  timeUnit: "year" as const,
  moments: [
    { id: "b", time: 2001.5, timeLabel: "2001.07.02", phase: "B" },
    { id: "a", time: 2000, timeLabel: "2000.01.01", phase: "A" },
    { id: "c", time: 2003, timeLabel: "2003.01.01", phase: "B" },
  ],
};

describe("dataset", () => {
  it("sorts moments by time and fills defaults", () => {
    const d = normalizeDataset(tiny);
    expect(d.moments.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(d.aspect).toBe(1.6);
  });

  it("still accepts Phase 1 datasets that call their moments `slices`", () => {
    const { moments, ...rest } = tiny;
    const d = normalizeDataset({ ...rest, slices: moments });
    expect(d.moments).toHaveLength(3);
    expect("slices" in d).toBe(false);
  });

  it("rejects duplicate ids, missing fields and zero-length time", () => {
    expect(() => normalizeDataset({ ...tiny, moments: [tiny.moments[0], tiny.moments[0]] })).toThrow(TemporalDatasetError);
    expect(() => normalizeDataset({ id: "x", title: "x", moments: [{ id: "a" }, { id: "b" }] })).toThrow(/time/);
    expect(() =>
      normalizeDataset({ id: "x", title: "x", moments: [{ id: "a", time: 1, timeLabel: "" }, { id: "b", time: 1, timeLabel: "" }] }),
    ).toThrow(/span/);
    expect(() => normalizeDataset(null)).toThrow(TemporalDatasetError);
  });

  it("labels any time: a moment's own label, else an interpolated date", () => {
    const d = normalizeDataset(tiny);
    expect(labelForTime(d, 2001.5)).toBe("2001.07.02");
    expect(labelForTime(d, 2000.75)).toMatch(/^2000\.(09|10)\.\d\d$/);
    expect(labelForTime(d, 1990)).toBe("2000.01.01");
    expect(formatDecimalYear(2174 + 162 / 365)).toBe("2174.06.12");
    const generic = normalizeDataset({ ...tiny, timeUnit: "generic" });
    expect(labelForTime(generic, 2001.4)).toBe("2001.07.02");
  });

  it("groups contiguous phases", () => {
    expect(phaseSegments(normalizeDataset(tiny))).toEqual([
      { phase: "A", start: 0, end: 0 },
      { phase: "B", start: 1, end: 2 },
    ]);
  });
});

describe("temporal sampling", () => {
  const d = normalizeDataset(tiny);
  const s = sampleSlices(d, 301);

  it("spaces slices evenly in time across the whole archive", () => {
    expect(sliceTime(d, s, 0)).toBe(2000);
    expect(sliceTime(d, s, 300)).toBe(2003);
    expect(s.time[150]).toBeCloseTo(2001.5);
    expect(s.momentSlice[1]).toBeCloseTo(150);
  });

  it("holds each moment, then crossfades smoothly and monotonically to the next", () => {
    expect(s.a[0]).toBe(0);
    expect(s.blend[0]).toBe(0);
    expect(s.blend[150]).toBe(0); // exactly on moment b, sampled as b → c with nothing of c yet
    expect(s.a[150]).toBe(1);
    expect(s.blend[149]).toBe(1); // just before b, a → b has fully arrived at b
    let last = -1;
    for (let i = 0; i < 150; i++) {
      expect(s.a[i]).toBe(0);
      expect(s.b[i]).toBe(1);
      expect(s.blend[i]).toBeGreaterThanOrEqual(last);
      last = s.blend[i];
    }
    // The transition happens in the middle half of the interval.
    expect(s.blend[30]).toBe(0);
    expect(s.blend[75]).toBeCloseTo(0.5, 1);
    expect(s.blend[120]).toBe(1);
  });

  it("knows which moment a slice mostly shows, and where each moment lies", () => {
    expect(dominantMoment(s, 10)).toBe(0);
    expect(dominantMoment(s, 140)).toBe(1);
    expect(sliceForMoment(s, 2)).toBe(300);
    expect(momentPosition(s, 75)).toBeCloseTo(0.5);
    expect(momentPosition(s, 225)).toBeCloseTo(1.5);
    expect(stepMoment(s, 10, 1)).toBe(150);
    expect(stepMoment(s, 150, 1)).toBe(300);
    expect(stepMoment(s, 150, -1)).toBe(0);
    expect(sliceLabel(d, s, 150)).toBe("2001.07.02");
  });
});

describe("volume layout", () => {
  const layout = createVolumeLayout({ count: 500, spacing: 0.035, height: 5, aspect: 1.6 });

  it("packs slices into one block, earliest at the front", () => {
    expect(layout.sliceWidth).toBe(8);
    expect(layout.depth).toBeCloseTo(499 * 0.035);
    expect(layout.sliceZ(0)).toBeCloseTo(layout.depth / 2);
    expect(layout.sliceZ(499)).toBeCloseTo(-layout.depth / 2);
    expect(layout.sliceAt(layout.sliceZ(123.5))).toBeCloseTo(123.5);
  });

  it("observes the block obliquely, so its thickness is visible", () => {
    const pose = layout.observer(0);
    const to = vec3(pose.position.x - pose.target.x, 0, pose.position.z - pose.target.z);
    const angle = (Math.atan2(to.x, to.z) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(25);
    expect(angle).toBeLessThan(45);
    expect(pose.position.y).toBeGreaterThan(pose.target.y);
    // Travelling deeper moves the observer with the present.
    expect(layout.observer(400).target.z).toBeLessThan(pose.target.z);
  });

  it("points at the slice where a ray enters the visible block", () => {
    const front = pickSlice(layout, vec3(0, 0, 20), vec3(0, 0, -1));
    expect(front).toBe(0);
    // From the side, a ray entering at z picks the slice at that depth.
    const z = layout.sliceZ(200);
    expect(pickSlice(layout, vec3(20, 0, z), vec3(-1, 0, 0))).toBe(200);
    // Slices already travelled through cannot be picked.
    expect(pickSlice(layout, vec3(0, 0, 20), vec3(0, 0, -1), 300)).toBe(300);
    expect(pickSlice(layout, vec3(0, 20, 20), vec3(0, 0, -1))).toBeNull();
  });
});

describe("focus", () => {
  const layout = createVolumeLayout({ count: 500 });

  it("extracts the slice out of the block toward the observer and back again", () => {
    const rest = slicePose(layout, 100, 0);
    expect(rest.position).toEqual(vec3(0, 0, layout.sliceZ(100)));
    const out = slicePose(layout, 100, 1);
    expect(out.position.y).toBeCloseTo(EXTRACT.lift * layout.sliceHeight);
    expect(out.position.z).toBeGreaterThan(rest.position.z);
    expect(out.yaw).toBeCloseTo(EXTRACT.yaw);
    expect(Math.hypot(out.normal.x, out.normal.y, out.normal.z)).toBeCloseTo(1);
  });

  it("opens a gap around the focused slice that closes with distance", () => {
    expect(separation(100, 100, 1)).toBe(0);
    expect(separation(101, 100, 1)).toBeGreaterThan(0);
    expect(separation(99, 100, 1)).toBeLessThan(0);
    expect(separation(101, 100, 1)).toBeGreaterThan(separation(110, 100, 1));
    expect(separation(101, 100, 0)).toBe(0);
  });

  it("aims the focus observer at the extracted slice", () => {
    const pose = layout.focusObserver(100);
    const slice = slicePose(layout, 100, 1);
    expect(rayHitsSlice(slice, layout.sliceWidth, layout.sliceHeight, pose.position, normalizeVec(sub(pose.target, pose.position)))).toBe(true);
    expect(rayHitsSlice(slice, layout.sliceWidth, layout.sliceHeight, pose.position, vec3(0, 1, 0))).toBe(false);
  });
});

const sub = (a: ReturnType<typeof vec3>, b: ReturnType<typeof vec3>) => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
const normalizeVec = (a: ReturnType<typeof vec3>) => {
  const l = Math.hypot(a.x, a.y, a.z);
  return vec3(a.x / l, a.y / l, a.z / l);
};

describe("draw order", () => {
  it("draws slices farthest from the camera first, on both sides of it", () => {
    expect(Array.from(drawOrder(5, -3))).toEqual([4, 3, 2, 1, 0]);
    expect(Array.from(drawOrder(5, 9))).toEqual([0, 1, 2, 3, 4]);
    const inside = Array.from(drawOrder(9, 6));
    expect(inside[inside.length - 1]).toBe(6);
    expect(new Set(inside).size).toBe(9);
    for (let i = 1; i < inside.length; i++) {
      expect(Math.abs(inside[i] - 6)).toBeLessThanOrEqual(Math.abs(inside[i - 1] - 6));
    }
  });
});

describe("waves", () => {
  it("send a single packet through the block, fading, then leave it still", () => {
    let seed = 0.3;
    const waves = new TemporalWaves({ count: 500, random: () => (seed = (seed * 9301 + 0.49297) % 1) });
    waves.update(5);
    expect(waves.waves).toHaveLength(1);
    const wave = waves.waves[0];
    const start = wave.position;
    waves.update(1, false);
    expect(Math.abs(wave.position - start)).toBeGreaterThan(40);
    const strong = waves.strength(wave);
    waves.update(4, false);
    expect(waves.strength(wave)).toBeLessThan(strong);
    for (let i = 0; i < 40; i++) waves.update(0.5, false);
    expect(waves.waves).toHaveLength(0);
  });

  it("packs waves for the shader and keeps within capacity", () => {
    const waves = new TemporalWaves({ count: 500, capacity: 2 });
    waves.launchFrom(100);
    waves.launchFrom(300);
    expect(waves.waves).toHaveLength(2);
    waves.update(0.5, false);
    const out = waves.write(new Float32Array(8));
    expect(out[1]).toBeGreaterThan(0);
    expect(Math.abs(out[3])).toBe(1);
  });
});

describe("level of detail", () => {
  it("decreases monotonically with distance ahead", () => {
    let last = Infinity;
    for (let d = 0; d < 20; d += 0.25) {
      const lod = computeLOD(d);
      expect(lod.detail).toBeLessThanOrEqual(last + 1e-9);
      expect(lod.far + lod.mid + lod.near).toBeCloseTo(1);
      last = lod.detail;
    }
  });

  it("classifies near, mid and far and wants full resolution only nearby", () => {
    expect(computeLOD(0).level).toBe("near");
    expect(computeLOD(4).level).toBe("mid");
    expect(computeLOD(12).level).toBe("far");
    expect(computeLOD(-3).visibility).toBe(0);
    expect(computeLOD(0).wantsHighRes).toBe(true);
    expect(computeLOD(10).wantsHighRes).toBe(false);
  });
});

describe("navigation", () => {
  const run = (nav: TemporalNavigation, seconds: number, start = 0) => {
    let now = start;
    for (let i = 0; i < seconds * 60; i++) {
      now += 1000 / 60;
      nav.update(1 / 60, now);
    }
    return now;
  };

  it("eases toward a target without overshoot", () => {
    const nav = new TemporalNavigation({ count: 10 });
    nav.goTo(4);
    let max = 0;
    let now = 0;
    for (let i = 0; i < 240; i++) {
      now += 1000 / 60;
      nav.update(1 / 60, now);
      max = Math.max(max, nav.position);
    }
    expect(nav.position).toBeCloseTo(4, 3);
    expect(max).toBeLessThan(4.001);
  });

  it("settles wheel travel on the nearest slice and clamps to the volume", () => {
    const nav = new TemporalNavigation({ count: 10 });
    nav.scroll(340 * 1.3, 0);
    run(nav, 3, 0);
    expect(nav.position).toBeCloseTo(1, 3);
    for (let i = 0; i < 40; i++) nav.scroll(400, 5000 + i);
    run(nav, 4, 6000);
    expect(nav.present).toBe(9);
    expect(nav.position).toBeCloseTo(9, 2);
  });

  it("scales wheel travel to a dense volume", () => {
    const nav = new TemporalNavigation({ count: 512, wheelScale: 512 / 4000, maxStep: 512 / 12 });
    nav.scroll(100, 0);
    expect(nav.target).toBeCloseTo(12.8);
    nav.scroll(100000, 1);
    expect(nav.target).toBeCloseTo(12.8 + 512 / 12);
  });

  it("steps one slice at a time", () => {
    const nav = new TemporalNavigation({ count: 5, start: 2 });
    nav.step(1);
    expect(nav.target).toBe(3);
    nav.step(-1);
    nav.step(-1);
    expect(nav.target).toBe(1);
  });

  it("spring survives long frames", () => {
    const s = new Spring(0, 8, 1);
    s.update(1, 2);
    expect(s.value).toBeGreaterThan(0.99);
    expect(Number.isFinite(s.velocity)).toBe(true);
  });
});

describe("state machine", () => {
  const base = initialState();

  it("goes observe → focus → entering → inside → exiting → focus → observe", () => {
    let s = reduce(base, { type: "select", index: 3 });
    expect(s).toMatchObject({ mode: "focus", focus: 3 });
    s = reduce(s, { type: "enter" });
    expect(s).toMatchObject({ mode: "entering", focus: 3 });
    s = reduce(s, { type: "entered" });
    expect(s.mode).toBe("inside");
    s = reduce(s, { type: "escape" });
    expect(s.mode).toBe("exiting");
    s = reduce(s, { type: "exited" });
    expect(s).toMatchObject({ mode: "focus", focus: 3 });
    s = reduce(s, { type: "escape" });
    expect(s).toMatchObject({ mode: "observe", focus: null });
  });

  it("reverses mid-transition and ignores browsing input while inside", () => {
    let s = reduce(base, { type: "enter", index: 2 });
    s = reduce(s, { type: "escape" });
    expect(s.mode).toBe("exiting");
    s = reduce(s, { type: "enter" });
    expect(s.mode).toBe("entering");
    s = reduce(s, { type: "entered" });
    expect(reduce(s, { type: "select", index: 5 })).toBe(s);
    expect(reduce(s, { type: "hover", index: 5 })).toBe(s);
  });

  it("enter without a focus uses the present slice; travel releases focus", () => {
    const s = reduce({ ...base, present: 7 }, { type: "enter" });
    expect(s.focus).toBe(7);
    const f = reduce(base, { type: "select", index: 1 });
    expect(reduce(f, { type: "travel" })).toMatchObject({ mode: "observe", focus: null });
  });

  it("store notifies only on change", () => {
    const store = createTemporalStore(base);
    let calls = 0;
    store.subscribe(() => calls++);
    store.dispatch({ type: "escape" });
    store.dispatch({ type: "select", index: 1 });
    store.dispatch({ type: "select", index: 1 });
    expect(calls).toBe(1);
  });
});

describe("enter transition", () => {
  it("hermite hits its endpoints", () => {
    expect(hermite(0, 1, 0)).toBe(0);
    expect(hermite(1, 1, 0)).toBe(1);
  });

  it("finishes the approach exactly at the cover pose by the swap point", () => {
    const start = { position: vec3(-2, 0.4, 3), target: vec3(0, 0, -2) };
    const center = vec3(0, 0, 0);
    const normal = vec3(0, 0, 1);
    const pose = enterCameraPose(SWAP_POINT, start, center, normal, 1.5);
    expect(pose.position.z).toBeCloseTo(1.5);
    expect(pose.position.x).toBeCloseTo(0);
    expect(pose.target.z).toBeCloseTo(0);
    expect(enterCameraPose(0, start, center, normal, 1.5)).toEqual(start);
    expect(fieldPhase(1).dim).toBe(1);
  });

  it("passes through the membrane once, after the swap", () => {
    expect(momentPhase(SWAP_POINT).toMembrane).toBeCloseTo(MEMBRANE_DISTANCE);
    expect(momentPhase(SWAP_POINT).membrane).toBe(1);
    expect(momentPhase(1).toMembrane).toBeLessThan(0);
    expect(momentPhase(1).membrane).toBe(0);
    let crossings = 0;
    let prev = momentPhase(SWAP_POINT).toMembrane;
    for (let p = SWAP_POINT; p <= 1; p += 0.005) {
      const d = momentPhase(p).toMembrane;
      if (prev > 0 && d <= 0) crossings++;
      prev = d;
    }
    expect(crossings).toBe(1);
  });

  it("cover distance is closer than contain distance", () => {
    for (const aspect of [0.6, 1, 1.6, 2.4]) {
      expect(coverDistance(2.4, 1.5, 38, aspect, 1)).toBeLessThanOrEqual(containDistance(2.4, 1.5, 38, aspect));
    }
  });
});

describe("passage optics", () => {
  it("is silent at rest, continuous at the swap and resolves inside", async () => {
    const { passageOptics, SWAP_POINT: swap } = await import("../src/engine");
    expect(passageOptics(0)).toEqual({ film: 0, spread: 0, dispersion: 0, interference: 0 });
    const a = passageOptics(swap - 1e-4);
    const b = passageOptics(swap + 1e-4);
    for (const k of ["film", "spread", "dispersion", "interference"] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.01);
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => passageOptics(swap + (i / 200) * (1 - swap)).interference));
    expect(peak).toBeGreaterThan(0.9);
    const inside = passageOptics(1);
    expect(inside.interference).toBeLessThan(0.01);
    expect(inside.film).toBeLessThan(0.01);
  });
});

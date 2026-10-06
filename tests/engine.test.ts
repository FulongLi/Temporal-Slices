import { describe, expect, it } from "vitest";
import {
  computeLOD,
  containDistance,
  corridorLayout,
  coverDistance,
  createTemporalStore,
  driftLayout,
  enterCameraPose,
  fieldPhase,
  formatDecimalYear,
  hermite,
  initialState,
  labelAt,
  momentPhase,
  normalizeDataset,
  phaseSegments,
  reduce,
  Spring,
  SWAP_POINT,
  TemporalDatasetError,
  TemporalNavigation,
  timeAt,
  MEMBRANE_DISTANCE,
  vec3,
} from "../src/engine";

const tiny = {
  id: "t",
  title: "Test",
  timeUnit: "year" as const,
  slices: [
    { id: "b", time: 2001.5, timeLabel: "2001.07.02", phase: "B" },
    { id: "a", time: 2000, timeLabel: "2000.01.01", phase: "A" },
    { id: "c", time: 2003, timeLabel: "2003.01.01", phase: "B" },
  ],
};

describe("dataset", () => {
  it("sorts slices by time and fills defaults", () => {
    const d = normalizeDataset(tiny);
    expect(d.slices.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(d.aspect).toBe(1.6);
  });

  it("rejects duplicate ids and missing fields", () => {
    expect(() => normalizeDataset({ ...tiny, slices: [tiny.slices[0], tiny.slices[0]] })).toThrow(TemporalDatasetError);
    expect(() => normalizeDataset({ id: "x", title: "x", slices: [{ id: "a" }, { id: "b" }] })).toThrow(/time/);
    expect(() => normalizeDataset(null)).toThrow(TemporalDatasetError);
  });

  it("interpolates time and labels between slices", () => {
    const d = normalizeDataset(tiny);
    expect(timeAt(d, 0.5)).toBeCloseTo(2000.75);
    expect(timeAt(d, 99)).toBe(2003);
    expect(labelAt(d, 1)).toBe("2001.07.02");
    expect(labelAt(d, 0.5)).toMatch(/^2000\.(09|10)\.\d\d$/);
    expect(formatDecimalYear(2174 + 162 / 365)).toBe("2174.06.12");
  });

  it("groups contiguous phases", () => {
    expect(phaseSegments(normalizeDataset(tiny))).toEqual([
      { phase: "A", start: 0, end: 0 },
      { phase: "B", start: 1, end: 2 },
    ]);
  });
});

describe("layout", () => {
  it("places slices along the time axis, future deeper", () => {
    for (const layout of [corridorLayout, driftLayout]) {
      const a = layout.placement(0).position;
      const b = layout.placement(10).position;
      expect(b.z).toBeLessThan(a.z);
      expect(layout.floorY).toBeLessThan(-layout.sliceHeight / 2);
    }
  });

  it("keeps the observer behind and beside the present slice", () => {
    const pose = corridorLayout.observer(5);
    const slice = corridorLayout.placement(5).position;
    expect(pose.position.z).toBeGreaterThan(slice.z);
    expect(pose.target.z).toBeLessThan(slice.z);
    expect(pose.position.x).not.toBe(slice.x);
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

  it("classifies near, mid and far and fades passed slices", () => {
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

  it("settles wheel travel on the nearest slice and clamps to the archive", () => {
    const nav = new TemporalNavigation({ count: 10 });
    nav.scroll(340 * 1.3, 0);
    run(nav, 3, 0);
    expect(nav.position).toBeCloseTo(1, 3);
    for (let i = 0; i < 40; i++) nav.scroll(400, 5000 + i);
    run(nav, 4, 6000);
    expect(nav.present).toBe(9);
    expect(nav.position).toBeCloseTo(9, 2);
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
  const base = initialState("corridor");

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

  it("finishes the field approach exactly at the cover pose by the swap point", () => {
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

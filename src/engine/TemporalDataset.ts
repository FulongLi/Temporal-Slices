import { clamp } from "./math";
import type { TemporalDataset, TemporalMomentData } from "./types";

export class TemporalDatasetError extends Error {}

/**
 * Validate a dataset and return a copy whose moments are sorted by time.
 * Phase 1 datasets called their moments `slices`; that key is still accepted.
 * Throws a TemporalDatasetError describing the first problem found.
 */
export function normalizeDataset(raw: unknown): TemporalDataset {
  if (!raw || typeof raw !== "object") throw new TemporalDatasetError("Dataset must be an object.");
  const data = raw as Partial<TemporalDataset> & { slices?: unknown };
  if (typeof data.id !== "string" || !data.id) throw new TemporalDatasetError("Dataset needs an `id`.");
  if (typeof data.title !== "string") throw new TemporalDatasetError("Dataset needs a `title`.");
  const source = data.moments ?? data.slices;
  if (!Array.isArray(source) || source.length < 2) {
    throw new TemporalDatasetError("Dataset needs at least two moments.");
  }
  const ids = new Set<string>();
  const moments = source.map((moment: Partial<TemporalMomentData>, index): TemporalMomentData => {
    const where = `moments[${index}]`;
    if (!moment || typeof moment !== "object") throw new TemporalDatasetError(`${where} must be an object.`);
    if (typeof moment.id !== "string" || !moment.id) throw new TemporalDatasetError(`${where} needs an \`id\`.`);
    if (ids.has(moment.id)) throw new TemporalDatasetError(`Duplicate moment id "${moment.id}".`);
    ids.add(moment.id);
    if (typeof moment.time !== "number" || !Number.isFinite(moment.time)) {
      throw new TemporalDatasetError(`${where} needs a numeric \`time\`.`);
    }
    if (typeof moment.timeLabel !== "string") throw new TemporalDatasetError(`${where} needs a \`timeLabel\`.`);
    if (moment.layers && !Array.isArray(moment.layers)) throw new TemporalDatasetError(`${where}.layers must be an array.`);
    return { ...(moment as TemporalMomentData) };
  });
  moments.sort((a, b) => a.time - b.time);
  if (moments[0].time === moments[moments.length - 1].time) {
    throw new TemporalDatasetError("Moments must span a non-zero stretch of time.");
  }
  const aspect = typeof data.aspect === "number" && data.aspect > 0 ? data.aspect : 1.6;
  const { slices: _legacy, ...rest } = data;
  return { ...rest, id: data.id, title: data.title, aspect, timeUnit: data.timeUnit ?? "generic", moments };
}

/** Format a decimal year as YYYY.MM.DD. */
export function formatDecimalYear(time: number) {
  const year = Math.floor(time);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  // Round to the hour so decimal-year round trips do not slip a day.
  const hours = Math.round(((time - year) * (end - start)) / 3_600_000);
  const date = new Date(start + hours * 3_600_000);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${year}.${mm}.${dd}`;
}

/** Index of the last moment at or before `time` (0 when before the first). */
export function momentBefore(dataset: TemporalDataset, time: number) {
  const { moments } = dataset;
  let lo = 0;
  let hi = moments.length - 1;
  if (time >= moments[hi].time) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (moments[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Time span covered by the dataset. */
export function timeSpan(dataset: TemporalDataset) {
  const { moments } = dataset;
  return { start: moments[0].time, end: moments[moments.length - 1].time };
}

/** Label for an arbitrary time: an interpolated date for year datasets. */
export function labelForTime(dataset: TemporalDataset, time: number) {
  const span = timeSpan(dataset);
  const t = clamp(time, span.start, span.end);
  const k = momentBefore(dataset, t);
  const moment = dataset.moments[k];
  if (Math.abs(t - moment.time) < 1e-6) return moment.timeLabel;
  return dataset.timeUnit === "year" ? formatDecimalYear(t) : nearestMoment(dataset, t).timeLabel;
}

/** The moment closest in time. */
export function nearestMoment(dataset: TemporalDataset, time: number) {
  const { moments } = dataset;
  const k = momentBefore(dataset, time);
  const next = moments[Math.min(k + 1, moments.length - 1)];
  return time - moments[k].time <= next.time - time ? moments[k] : next;
}

export interface PhaseSegment {
  phase: string;
  start: number;
  end: number;
}

/** Contiguous runs of moments sharing a phase, as index ranges. */
export function phaseSegments(dataset: TemporalDataset): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  dataset.moments.forEach((moment, index) => {
    const phase = moment.phase ?? "";
    const last = segments[segments.length - 1];
    if (last && last.phase === phase) last.end = index;
    else segments.push({ phase, start: index, end: index });
  });
  return segments;
}

import { clamp } from "./math";
import type { TemporalDataset, TemporalSliceData } from "./types";

export class TemporalDatasetError extends Error {}

/**
 * Validate a dataset and return a copy whose slices are sorted by time.
 * Throws a TemporalDatasetError describing the first problem found.
 */
export function normalizeDataset(raw: unknown): TemporalDataset {
  if (!raw || typeof raw !== "object") throw new TemporalDatasetError("Dataset must be an object.");
  const data = raw as Partial<TemporalDataset>;
  if (typeof data.id !== "string" || !data.id) throw new TemporalDatasetError("Dataset needs an `id`.");
  if (typeof data.title !== "string") throw new TemporalDatasetError("Dataset needs a `title`.");
  if (!Array.isArray(data.slices) || data.slices.length < 2) {
    throw new TemporalDatasetError("Dataset needs at least two slices.");
  }
  const ids = new Set<string>();
  const slices = data.slices.map((slice, index): TemporalSliceData => {
    const where = `slices[${index}]`;
    if (!slice || typeof slice !== "object") throw new TemporalDatasetError(`${where} must be an object.`);
    if (typeof slice.id !== "string" || !slice.id) throw new TemporalDatasetError(`${where} needs an \`id\`.`);
    if (ids.has(slice.id)) throw new TemporalDatasetError(`Duplicate slice id "${slice.id}".`);
    ids.add(slice.id);
    if (typeof slice.time !== "number" || !Number.isFinite(slice.time)) {
      throw new TemporalDatasetError(`${where} needs a numeric \`time\`.`);
    }
    if (typeof slice.timeLabel !== "string") throw new TemporalDatasetError(`${where} needs a \`timeLabel\`.`);
    if (slice.layers && !Array.isArray(slice.layers)) throw new TemporalDatasetError(`${where}.layers must be an array.`);
    return { ...slice };
  });
  slices.sort((a, b) => a.time - b.time);
  const aspect = typeof data.aspect === "number" && data.aspect > 0 ? data.aspect : 1.6;
  return { ...data, id: data.id, title: data.title, aspect, timeUnit: data.timeUnit ?? "generic", slices };
}

/** Time at a fractional slice position, interpolated between neighbouring slices. */
export function timeAt(dataset: TemporalDataset, cursor: number) {
  const { slices } = dataset;
  const c = clamp(cursor, 0, slices.length - 1);
  const i = Math.min(slices.length - 2, Math.floor(c));
  const t = c - i;
  return slices[i].time + (slices[i + 1].time - slices[i].time) * t;
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

/**
 * Label for a fractional cursor. Exactly on a slice the slice's own label is
 * used; between slices the time is interpolated, so the date runs like an
 * odometer while travelling.
 */
export function labelAt(dataset: TemporalDataset, cursor: number) {
  const nearest = Math.round(clamp(cursor, 0, dataset.slices.length - 1));
  if (Math.abs(cursor - nearest) < 0.015) return dataset.slices[nearest].timeLabel;
  const time = timeAt(dataset, cursor);
  return dataset.timeUnit === "year" ? formatDecimalYear(time) : time.toFixed(1);
}

export interface PhaseSegment {
  phase: string;
  start: number;
  end: number;
}

/** Contiguous runs of slices sharing a phase, as index ranges. */
export function phaseSegments(dataset: TemporalDataset): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  dataset.slices.forEach((slice, index) => {
    const phase = slice.phase ?? "";
    const last = segments[segments.length - 1];
    if (last && last.phase === phase) last.end = index;
    else segments.push({ phase, start: index, end: index });
  });
  return segments;
}

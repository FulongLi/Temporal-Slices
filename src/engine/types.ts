/**
 * The temporal data model. Nothing here knows what the slices depict:
 * a city, a person, an experiment, a fictional world.
 */

export interface TemporalSliceData {
  /** Stable identifier. */
  id: string;
  /** Position on the time axis, in the dataset's `timeUnit`. Slices are ordered by it. */
  time: number;
  /** Human-readable moment, e.g. "2174.06.12". */
  timeLabel: string;
  title?: string;
  description?: string;
  /** Era or chapter this moment belongs to, e.g. "Abandoned City". */
  phase?: string;
  /** Full image of the moment (URL relative to the app base, or absolute). */
  image?: string;
  /** Optional pre-reduced image for distant slices. Derived from `image` when absent. */
  thumbnail?: string;
  /**
   * Optional depth layers for the Enter Slice view, ordered far → near.
   * When composited they should reproduce `image`.
   */
  layers?: string[];
  /** Free-form environmental readings shown when the slice is near or focused. */
  attributes?: Record<string, string>;
}

export type TemporalTimeUnit = "year" | "generic";

export interface TemporalDataset {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  /** How `time` is interpreted when interpolating between slices. */
  timeUnit?: TemporalTimeUnit;
  /** Width / height of slice imagery. Defaults to 1.6. */
  aspect?: number;
  slices: TemporalSliceData[];
}

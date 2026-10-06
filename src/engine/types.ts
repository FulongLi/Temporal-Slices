/**
 * The temporal data model. Nothing here knows what the moments depict:
 * a city, a person, an experiment, a fictional world.
 *
 * A dataset holds a small number of source *moments*. The renderer turns
 * them into hundreds of thin temporal *slices*: each slice sits at its own
 * time and samples the two moments around it, so time reads as continuous.
 */

export interface TemporalMomentData {
  /** Stable identifier. */
  id: string;
  /** Position on the time axis, in the dataset's `timeUnit`. Moments are ordered by it. */
  time: number;
  /** Human-readable moment, e.g. "2174.06.12". */
  timeLabel: string;
  title?: string;
  description?: string;
  /** Era or chapter this moment belongs to, e.g. "Abandoned City". */
  phase?: string;
  /**
   * Image of the moment (URL relative to the app base, or absolute). An
   * array is laid out side by side as one picture, e.g. a two-page spread.
   */
  image?: string | string[];
  /**
   * Optional depth layers for the Enter Slice view, ordered far → near.
   * When composited they should reproduce `image`.
   */
  layers?: string[];
  /** Free-form environmental readings shown when the moment is focused. */
  attributes?: Record<string, string>;
}

export type TemporalTimeUnit = "year" | "generic";

export interface TemporalDataset {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  /** How `time` is interpreted when interpolating between moments. */
  timeUnit?: TemporalTimeUnit;
  /** Width / height of moment imagery, and of every slice. Defaults to 1.6. */
  aspect?: number;
  moments: TemporalMomentData[];
}

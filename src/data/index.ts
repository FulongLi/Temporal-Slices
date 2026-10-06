import lunarCity from "./lunar-city/temporal-slices.json";

/**
 * Registered temporal datasets. The engine and renderer only ever see the
 * generic TemporalDataset shape; swapping the demo for another archive means
 * adding an entry here (or loading JSON at runtime) — nothing else changes.
 */
export const datasets: Record<string, unknown> = {
  "lunar-city": lunarCity,
};

export const defaultDatasetId = "lunar-city";

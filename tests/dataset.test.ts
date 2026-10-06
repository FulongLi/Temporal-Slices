import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/data/lunar-city/temporal-slices.json";
import { normalizeDataset } from "../src/engine";

describe("lunar city demo dataset", () => {
  const dataset = normalizeDataset(raw);

  it("has between 30 and 50 slices in chronological order", () => {
    expect(dataset.slices.length).toBeGreaterThanOrEqual(30);
    expect(dataset.slices.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < dataset.slices.length; i++) {
      expect(dataset.slices[i].time).toBeGreaterThan(dataset.slices[i - 1].time);
    }
  });

  it("references imagery that exists locally", () => {
    for (const slice of dataset.slices) {
      for (const file of [slice.image, ...(slice.layers ?? [])]) {
        expect(file, slice.id).toBeTruthy();
        expect(existsSync(join(__dirname, "../public", file!)), file).toBe(true);
      }
    }
  });

  it("describes every moment", () => {
    for (const slice of dataset.slices) {
      expect(slice.title).toBeTruthy();
      expect(slice.description).toBeTruthy();
      expect(slice.phase).toBeTruthy();
    }
  });
});

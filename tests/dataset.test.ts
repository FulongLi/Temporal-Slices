import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/data/lunar-city/dataset.json";
import { normalizeDataset, sampleSlices } from "../src/engine";

describe("lunar city demo dataset", () => {
  const dataset = normalizeDataset(raw);

  it("has a small number of moments in chronological order", () => {
    expect(dataset.moments.length).toBeGreaterThanOrEqual(8);
    expect(dataset.moments.length).toBeLessThanOrEqual(16);
    for (let i = 1; i < dataset.moments.length; i++) {
      expect(dataset.moments[i].time).toBeGreaterThan(dataset.moments[i - 1].time);
    }
  });

  it("references imagery that exists locally", () => {
    for (const moment of dataset.moments) {
      const images = [moment.image, ...(moment.layers ?? [])].flat();
      for (const file of images) {
        expect(file, moment.id).toBeTruthy();
        expect(existsSync(join(__dirname, "../public", file!)), file).toBe(true);
      }
    }
  });

  it("describes every moment", () => {
    for (const moment of dataset.moments) {
      expect(moment.title).toBeTruthy();
      expect(moment.description).toBeTruthy();
      expect(moment.phase).toBeTruthy();
    }
  });

  it("gives every moment a run of slices that show it in full", () => {
    const sampling = sampleSlices(dataset, 512);
    dataset.moments.forEach((_, k) => {
      let pure = 0;
      for (let i = 0; i < sampling.count; i++) {
        if ((sampling.a[i] === k && sampling.blend[i] === 0) || (sampling.b[i] === k && sampling.blend[i] === 1)) pure++;
      }
      expect(pure, `moment ${k}`).toBeGreaterThan(3);
    });
  });
});

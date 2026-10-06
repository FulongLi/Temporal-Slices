import { DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, PlaneGeometry } from "three";
import type { SliceSampling } from "../engine";

/**
 * Every slice of the volume is an instance of one unit plane, segmented so
 * the vertex shader can bend it. Per-instance attributes:
 *
 *   aSlice   index of the slice this instance draws
 *   aImage   (moment A, moment B, blend) sampled by that slice
 *   aSeed    a stable random value per slice
 *
 * Slices are translucent and blended without depth writes, so they must be
 * drawn back to front. For parallel planes that order depends only on where
 * the camera is along the time axis, so instance → slice assignment is
 * permuted (and the attributes re-uploaded) only when the camera crosses a
 * slice: a few kilobytes, a handful of times per second at most.
 */

export interface VolumeGeometry {
  geometry: InstancedBufferGeometry;
  /** Reorder instances for a camera at fractional slice position `cameraSlice`. */
  sortFor(cameraSlice: number): void;
  dispose(): void;
}

/**
 * Back-to-front order for parallel slices seen from `cameraSlice`: slices
 * farthest from the camera's position along the axis come first. Slices on
 * opposite sides of the camera never overlap on screen, so interleaving the
 * two sides is safe.
 */
export function drawOrder(count: number, cameraSlice: number, out = new Uint16Array(count)) {
  let lo = 0;
  let hi = count - 1;
  let k = 0;
  while (lo <= hi) {
    if (Math.abs(lo - cameraSlice) >= Math.abs(hi - cameraSlice)) out[k++] = lo++;
    else out[k++] = hi--;
  }
  return out;
}

export function createVolumeGeometry(sampling: SliceSampling, segments: [number, number] = [24, 14]): VolumeGeometry {
  const count = sampling.count;
  const plane = new PlaneGeometry(1, 1, segments[0], segments[1]);
  const geometry = new InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.getAttribute("position"));
  geometry.setAttribute("uv", plane.getAttribute("uv"));
  geometry.instanceCount = count;

  const seeds = Float32Array.from({ length: count }, (_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1);
  const slice = new InstancedBufferAttribute(new Float32Array(count), 1);
  const image = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const seed = new InstancedBufferAttribute(new Float32Array(count), 1);
  for (const attribute of [slice, image, seed]) attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aSlice", slice);
  geometry.setAttribute("aImage", image);
  geometry.setAttribute("aSeed", seed);

  const order = new Uint16Array(count);
  let sortedFor = Number.NaN;

  return {
    geometry,
    sortFor(cameraSlice) {
      // Only the integer cell matters; beyond either end the order is fixed.
      const cell = Math.max(-1, Math.min(count, Math.round(cameraSlice)));
      if (cell === sortedFor) return;
      sortedFor = cell;
      drawOrder(count, cell, order);
      const s = slice.array as Float32Array;
      const im = image.array as Float32Array;
      const sd = seed.array as Float32Array;
      for (let k = 0; k < count; k++) {
        const i = order[k];
        s[k] = i;
        im[k * 3] = sampling.a[i];
        im[k * 3 + 1] = sampling.b[i];
        im[k * 3 + 2] = sampling.blend[i];
        sd[k] = Math.abs(seeds[i]);
      }
      slice.needsUpdate = true;
      image.needsUpdate = true;
      seed.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      plane.dispose();
    },
  };
}

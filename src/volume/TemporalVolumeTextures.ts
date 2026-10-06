import {
  CanvasTexture,
  Color,
  DataArrayTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
} from "three";
import type { TemporalDataset } from "../engine";

/**
 * Imagery for the temporal volume.
 *
 * - Every moment is drawn once into a layer of a single texture array that
 *   all slices sample, so hundreds of slices cost one texture binding and no
 *   duplicated images. Layers load nearest-to-the-present first; distant
 *   slices sample them through heavily biased mip levels (blurred memory).
 * - Full-resolution textures exist only for the moments a focused slice is
 *   made of, and are released a few seconds after focus moves on.
 * - Depth layers for the Enter Slice view are fetched on focus.
 */

const HIGH_EDGE = 1800;
const LAYER_EDGE = 1800;
const HIGH_LINGER_MS = 4000;
const MAX_HIGH = 6;
const MAX_LAYER_SETS = 2;
/** Background colour unloaded layers start with (matches the scene). */
const EMPTY = [3, 4, 6, 255];

type HighState = "none" | "loading" | "ready";

/** Long edge of the shared array: smaller when there are many moments. */
function arrayEdge(moments: number) {
  if (moments > 48) return 512;
  if (moments > 24) return 768;
  return 1024;
}

function blankTexture() {
  const texture = new DataTexture(new Uint8Array(EMPTY), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export class TemporalVolumeTextures {
  readonly blank: Texture = blankTexture();
  readonly array: DataArrayTexture;
  readonly width: number;
  readonly height: number;
  /** Whether each moment's array layer has been filled. */
  readonly loaded: boolean[];
  /** Average colour of each moment, used to tint light and edges. */
  readonly tint: Color[];
  /** Mean linear luminance of each moment (NaN until loaded), for exposure. */
  readonly luminance: number[];
  readonly high: (Texture | null)[];
  private highState: HighState[];
  private wantedAt: number[];
  private images = new Map<string, Promise<HTMLImageElement>>();
  private layerSets = new Map<number, Promise<Texture[]>>();
  private loadingHigh = false;
  private disposed = false;

  constructor(
    private dataset: TemporalDataset,
    private baseUrl: string,
    private anisotropy = 4,
  ) {
    const n = dataset.moments.length;
    const aspect = this.aspect();
    const edge = arrayEdge(n);
    this.width = aspect >= 1 ? edge : Math.round(edge * aspect);
    this.height = aspect >= 1 ? Math.round(edge / aspect) : edge;
    const data = new Uint8Array(this.width * this.height * 4 * n);
    for (let i = 0; i < data.length; i += 4) data.set(EMPTY, i);
    this.array = new DataArrayTexture(data, this.width, this.height, n);
    this.array.format = RGBAFormat;
    this.array.type = UnsignedByteType;
    this.array.colorSpace = SRGBColorSpace;
    this.array.generateMipmaps = true;
    this.array.minFilter = LinearMipmapLinearFilter;
    this.array.magFilter = LinearFilter;
    this.array.anisotropy = anisotropy;
    this.array.needsUpdate = true;
    this.loaded = Array(n).fill(false);
    this.tint = Array.from({ length: n }, () => new Color("#8fc4ff"));
    this.luminance = Array(n).fill(Number.NaN);
    this.high = Array(n).fill(null);
    this.highState = Array(n).fill("none");
    this.wantedAt = Array(n).fill(-Infinity);
  }

  private aspect() {
    return this.dataset.aspect ?? 1.6;
  }

  private url(path: string) {
    return /^(https?:|data:|blob:|\/)/.test(path) ? path : this.baseUrl + path;
  }

  private image(path: string) {
    const url = this.url(path);
    let request = this.images.get(url);
    if (!request) {
      request = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load ${url}`));
        img.src = url;
      });
      this.images.set(url, request);
    }
    return request;
  }

  /**
   * Draw a source (one image, or several side by side) into a canvas of the
   * dataset's aspect, cropping to cover it. `flip` writes rows bottom-up, as
   * raw texture uploads expect.
   */
  private async rasterise(source: string | string[], width: number, height: number, flip = false) {
    const parts = await Promise.all((Array.isArray(source) ? source : [source]).map((s) => this.image(s)));
    const unit = Math.max(...parts.map((p) => p.naturalHeight || p.height || 1));
    const widths = parts.map((p) => ((p.naturalWidth || p.width) / (p.naturalHeight || p.height || 1)) * unit);
    const total = widths.reduce((a, b) => a + b, 0);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: flip });
    if (!ctx) return canvas;
    const scale = Math.max(width / total, height / unit);
    const ox = (width - total * scale) / 2;
    const oy = (height - unit * scale) / 2;
    if (flip) {
      ctx.translate(0, height);
      ctx.scale(1, -1);
    }
    let x = ox;
    parts.forEach((part, i) => {
      ctx.drawImage(part, x, oy, widths[i] * scale, unit * scale);
      x += widths[i] * scale;
    });
    return canvas;
  }

  private canvasTexture(canvas: HTMLCanvasElement) {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    return texture;
  }

  private sizeFor(longEdge: number) {
    const aspect = this.aspect();
    return aspect >= 1
      ? { width: longEdge, height: Math.round(longEdge / aspect) }
      : { width: Math.round(longEdge * aspect), height: longEdge };
  }

  /** Mean luminance of the moments loaded so far (null before any). */
  meanLuminance() {
    const known = this.luminance.filter((l) => !Number.isNaN(l));
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  }

  private averageColour(canvas: HTMLCanvasElement, index: number) {
    const target = this.tint[index];
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 5;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0, 8, 5);
    const data = ctx.getImageData(0, 0, 8, 5).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    target.setRGB(r / n / 255, g / n / 255, b / n / 255, SRGBColorSpace);
    this.luminance[index] = 0.2126 * target.r + 0.7152 * target.g + 0.0722 * target.b;
    // Normalise brightness so every tint glows at a similar level.
    const hsl = { h: 0, s: 0, l: 0 };
    target.getHSL(hsl);
    target.setHSL(hsl.h, Math.min(1, hsl.s * 1.4 + 0.1), 0.6);
  }

  /** Fill every moment's array layer, nearest to moment `from` first. */
  async loadAll(from: number, concurrency = 3) {
    const order = this.dataset.moments.map((_, i) => i).sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    const next = async (): Promise<void> => {
      const index = order.shift();
      if (index === undefined || this.disposed) return;
      const source = this.dataset.moments[index].image;
      if (source) {
        try {
          const canvas = await this.rasterise(source, this.width, this.height, true);
          if (this.disposed) return;
          const pixels = canvas.getContext("2d")!.getImageData(0, 0, this.width, this.height).data;
          (this.array.image.data as Uint8Array).set(pixels, index * this.width * this.height * 4);
          this.array.addLayerUpdate(index);
          this.array.needsUpdate = true;
          this.loaded[index] = true;
          this.averageColour(canvas, index);
        } catch (error) {
          console.warn(error);
        }
      }
      // Yield between rasterisations so the first frames stay smooth.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return next();
    };
    await Promise.all(Array.from({ length: concurrency }, next));
  }

  /** Called every frame for moments that deserve full resolution. */
  wantHigh(moment: number, now: number) {
    this.wantedAt[moment] = now;
  }

  /** Start at most one high-res load and release what is no longer wanted. */
  update(now: number) {
    if (this.disposed) return;
    let held = 0;
    for (let i = 0; i < this.high.length; i++) {
      if (this.highState[i] === "none") continue;
      held++;
      if (this.highState[i] === "ready" && now - this.wantedAt[i] > HIGH_LINGER_MS) {
        this.high[i]?.dispose();
        this.high[i] = null;
        this.highState[i] = "none";
        held--;
      }
    }
    if (this.loadingHigh || held >= MAX_HIGH) return;
    let best = -1;
    for (let i = 0; i < this.high.length; i++) {
      if (this.highState[i] !== "none" || now - this.wantedAt[i] > 100) continue;
      if (best < 0 || this.wantedAt[i] > this.wantedAt[best]) best = i;
    }
    if (best >= 0) void this.loadHigh(best);
  }

  private async loadHigh(index: number) {
    const source = this.dataset.moments[index].image;
    if (!source) return;
    this.loadingHigh = true;
    this.highState[index] = "loading";
    try {
      const { width, height } = this.sizeFor(HIGH_EDGE);
      const canvas = await this.rasterise(source, width, height);
      if (this.disposed) return;
      this.high[index] = this.canvasTexture(canvas);
      this.highState[index] = "ready";
    } catch (error) {
      console.warn(error);
      this.highState[index] = "none";
    } finally {
      this.loadingHigh = false;
    }
  }

  /**
   * Depth layers for the Enter Slice view, far → near. Falls back to the
   * single full image when the dataset provides no layers.
   */
  layers(moment: number): Promise<Texture[]> {
    let request = this.layerSets.get(moment);
    if (!request) {
      const data = this.dataset.moments[moment];
      const sources: (string | string[])[] = data.layers?.length ? data.layers : data.image ? [data.image] : [];
      const { width, height } = this.sizeFor(LAYER_EDGE);
      request = Promise.all(sources.map(async (source) => this.canvasTexture(await this.rasterise(source, width, height))));
      this.layerSets.set(moment, request);
      // Keep only the most recent few sets in memory.
      while (this.layerSets.size > MAX_LAYER_SETS) {
        const [oldest, set] = this.layerSets.entries().next().value!;
        this.layerSets.delete(oldest);
        void set.then((textures) => textures.forEach((t) => t.dispose()));
      }
    }
    return request;
  }

  dispose() {
    this.disposed = true;
    this.array.dispose();
    for (const t of this.high) t?.dispose();
    for (const set of this.layerSets.values()) void set.then((textures) => textures.forEach((t) => t.dispose()));
    this.blank.dispose();
  }
}

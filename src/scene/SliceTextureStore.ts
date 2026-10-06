import { CanvasTexture, Color, DataTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from "three";
import type { TemporalDataset } from "../engine";

/**
 * Progressive imagery for the temporal field.
 *
 * - Every slice gets a small texture early, loaded outward from the present.
 *   Distant slices only ever sample it heavily blurred (mip bias).
 * - Full-resolution textures exist only for the few slices near the present
 *   or under focus, are rasterised one per frame, and are released a few
 *   seconds after the observer moves on.
 * - Depth layers for the Enter Slice view are fetched on focus, so the
 *   passage can begin without waiting.
 */

const LOW_SIZE = 384;
const HIGH_SIZE = 1600;
const LAYER_SIZE = 1600;
const HIGH_LINGER_MS = 3500;
const MAX_HIGH = 9;
const MAX_LAYER_SETS = 2;

type HighState = "none" | "loading" | "ready";

function blankTexture() {
  const texture = new DataTexture(new Uint8Array([3, 4, 6, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export class SliceTextureStore {
  readonly blank: Texture = blankTexture();
  readonly low: (Texture | null)[];
  readonly high: (Texture | null)[];
  /** Average colour of each slice's imagery, used to tint its glow. */
  readonly tint: Color[];
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
    const n = dataset.slices.length;
    this.low = Array(n).fill(null);
    this.high = Array(n).fill(null);
    this.tint = Array.from({ length: n }, () => new Color("#8fc4ff"));
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

  private rasterise(img: HTMLImageElement, longEdge: number) {
    const aspect = this.aspect();
    const canvas = document.createElement("canvas");
    canvas.width = aspect >= 1 ? longEdge : Math.round(longEdge * aspect);
    canvas.height = aspect >= 1 ? Math.round(longEdge / aspect) : longEdge;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private texture(canvas: HTMLCanvasElement) {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    return texture;
  }

  private averageColour(canvas: HTMLCanvasElement, target: Color) {
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
    // Normalise brightness so every tint glows at a similar level.
    const hsl = { h: 0, s: 0, l: 0 };
    target.getHSL(hsl);
    target.setHSL(hsl.h, Math.min(1, hsl.s * 1.6 + 0.12), 0.62);
  }

  /** Load every slice's small texture, nearest to `from` first. */
  async loadLow(from: number, concurrency = 3) {
    const order = this.dataset.slices.map((_, i) => i).sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
    const next = async (): Promise<void> => {
      const index = order.shift();
      if (index === undefined || this.disposed) return;
      const slice = this.dataset.slices[index];
      const source = slice.thumbnail ?? slice.image;
      if (source) {
        try {
          const canvas = this.rasterise(await this.image(source), LOW_SIZE);
          if (this.disposed) return;
          this.low[index] = this.texture(canvas);
          this.averageColour(canvas, this.tint[index]);
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

  /** Called every frame for slices that deserve full resolution. */
  wantHigh(index: number, now: number) {
    this.wantedAt[index] = now;
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
    const source = this.dataset.slices[index].image;
    if (!source) return;
    this.loadingHigh = true;
    this.highState[index] = "loading";
    try {
      const canvas = this.rasterise(await this.image(source), HIGH_SIZE);
      if (this.disposed) return;
      this.high[index] = this.texture(canvas);
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
  layers(index: number): Promise<Texture[]> {
    let request = this.layerSets.get(index);
    if (!request) {
      const slice = this.dataset.slices[index];
      const sources = slice.layers?.length ? slice.layers : slice.image ? [slice.image] : [];
      request = Promise.all(
        sources.map(async (source) => this.texture(this.rasterise(await this.image(source), LAYER_SIZE))),
      );
      this.layerSets.set(index, request);
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
    for (const t of [...this.low, ...this.high]) t?.dispose();
    for (const set of this.layerSets.values()) void set.then((textures) => textures.forEach((t) => t.dispose()));
    this.blank.dispose();
  }
}

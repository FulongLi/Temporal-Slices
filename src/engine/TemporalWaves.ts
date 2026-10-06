/**
 * Large-scale, low-frequency motion of the whole volume.
 *
 * Nothing wobbles on its own. Every so often a single wave enters one end
 * of the block and travels through it: as it passes, each slice is pushed a
 * little along the time axis (so the layers bunch up and spread apart) and
 * bows slightly. The wave fades as it travels and the block is still again.
 * Focusing a slice sends a smaller pair of waves outward from it.
 *
 * Positions and widths are in slices, so the motion scales with the volume.
 */

export interface Wave {
  /** Centre of the packet, in slices. */
  position: number;
  /** Slices per second; the sign is the direction of travel. */
  velocity: number;
  /** Initial strength (≈ peak displacement in slices). */
  amplitude: number;
  /** Width of the packet, in slices. */
  width: number;
  /** Seconds since launch. */
  age: number;
}

export interface WaveOptions {
  count: number;
  /** Seconds between ambient waves (random within the range). */
  interval?: [number, number];
  /** Maximum number of simultaneous waves (the shader's array size). */
  capacity?: number;
  random?: () => number;
}

/** Seconds for a wave's strength to fall to 1/e. */
const DECAY = 7;

export class TemporalWaves {
  readonly capacity: number;
  readonly waves: Wave[] = [];
  private count: number;
  private interval: [number, number];
  private random: () => number;
  private next: number;

  constructor(options: WaveOptions) {
    this.count = options.count;
    this.capacity = options.capacity ?? 4;
    this.interval = options.interval ?? [9, 15];
    this.random = options.random ?? Math.random;
    // The first wave arrives shortly after the volume has assembled.
    this.next = 4.5;
  }

  /** Current strength of a wave. */
  strength(wave: Wave) {
    const rise = Math.min(1, wave.age / 0.8);
    return wave.amplitude * rise * Math.exp(-wave.age / DECAY);
  }

  launch(wave: Omit<Wave, "age">) {
    if (this.waves.length >= this.capacity) {
      // Replace the weakest wave.
      let weakest = 0;
      for (let i = 1; i < this.waves.length; i++) {
        if (this.strength(this.waves[i]) < this.strength(this.waves[weakest])) weakest = i;
      }
      this.waves.splice(weakest, 1);
    }
    this.waves.push({ ...wave, age: 0 });
  }

  /** An ambient wave entering from one end of the block. */
  launchAmbient() {
    const fromFront = this.random() < 0.62;
    const speed = 55 + this.random() * 30;
    this.launch({
      position: fromFront ? -40 : this.count + 40,
      velocity: fromFront ? speed : -speed,
      amplitude: 3.6 + this.random() * 1.8,
      width: 34 + this.random() * 18,
    });
  }

  /** A pair of small waves leaving a slice in both directions. */
  launchFrom(index: number, amplitude = 1.6) {
    for (const direction of [-1, 1]) {
      this.launch({ position: index + direction * 6, velocity: direction * 70, amplitude, width: 18 });
    }
  }

  update(dt: number, ambient = true) {
    for (const wave of this.waves) {
      wave.age += dt;
      wave.position += wave.velocity * dt;
    }
    // Waves leave once they have faded or passed through the block.
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const gone = w.velocity > 0 ? w.position - 3 * w.width > this.count : w.position + 3 * w.width < 0;
      if (gone || this.strength(w) < 0.02) this.waves.splice(i, 1);
    }
    if (!ambient) return;
    this.next -= dt;
    if (this.next <= 0) {
      this.launchAmbient();
      const [lo, hi] = this.interval;
      this.next = lo + this.random() * (hi - lo);
    }
  }

  /** Pack into vec4s (position, strength, width, direction) for the shader. */
  write(out: Float32Array) {
    out.fill(0);
    this.waves.slice(0, out.length / 4).forEach((w, i) => {
      out.set([w.position, this.strength(w), w.width, Math.sign(w.velocity)], i * 4);
    });
    return out;
  }
}

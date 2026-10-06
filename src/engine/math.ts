/** Small numeric helpers shared by the engine. Pure functions, no Three.js. */

export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite smoothstep between edges a and b. */
export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach toward `target`. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * A damped harmonic spring. `stiffness` is the angular frequency (rad/s);
 * `damping` is the damping ratio (1 = critically damped, < 1 overshoots).
 */
export class Spring {
  value: number;
  velocity = 0;

  constructor(
    value = 0,
    public stiffness = 8,
    public damping = 1,
  ) {
    this.value = value;
  }

  update(target: number, dt: number) {
    // Sub-step so a long frame (tab switch, GC pause) cannot explode the spring.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const w = this.stiffness;
    for (let i = 0; i < steps; i++) {
      const accel = w * w * (target - this.value) - 2 * this.damping * w * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  settle(value: number) {
    this.value = value;
    this.velocity = 0;
  }
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return vec3(a.x / l, a.y / l, a.z / l);
};
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

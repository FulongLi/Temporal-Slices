import { clamp, Spring } from "./math";

/**
 * Movement along the time axis.
 *
 * Input moves a *target* position; the observed position follows it through
 * a critically damped spring, which gives travel weight: smooth acceleration,
 * smooth deceleration, no overshoot. When scrolling stops the target settles
 * on the nearest slice, so the present always comes to rest on one layer.
 */

export interface NavigationOptions {
  count: number;
  /** Spring angular frequency. Higher = snappier. */
  stiffness?: number;
  /** Slices travelled per pixel of wheel delta. */
  wheelScale?: number;
  /** Milliseconds of wheel silence before settling on a slice. */
  settleDelay?: number;
  /** Largest move a single wheel event may cause, in slices. */
  maxStep?: number;
  start?: number;
}

export class TemporalNavigation {
  readonly count: number;
  target: number;
  private spring: Spring;
  private wheelScale: number;
  private settleDelay: number;
  private maxStep: number;
  private lastWheel = -Infinity;

  constructor(options: NavigationOptions) {
    this.count = options.count;
    this.wheelScale = options.wheelScale ?? 1 / 340;
    this.settleDelay = options.settleDelay ?? 170;
    this.maxStep = options.maxStep ?? 1.2;
    const start = clamp(options.start ?? 0, 0, this.max);
    this.target = start;
    this.spring = new Spring(start, options.stiffness ?? 6.5, 1);
  }

  get max() {
    return this.count - 1;
  }
  get position() {
    return this.spring.value;
  }
  /** Slices per second; positive = toward the future. */
  get velocity() {
    return this.spring.velocity;
  }
  /** Index of the slice nearest the observer. */
  get present() {
    return Math.round(clamp(this.position, 0, this.max));
  }

  setStiffness(stiffness: number) {
    this.spring.stiffness = stiffness;
  }

  /** Continuous travel from a wheel or trackpad, in pixels. */
  scroll(deltaPixels: number, now = performance.now()) {
    const delta = clamp(deltaPixels * this.wheelScale, -this.maxStep, this.maxStep);
    const overshoot = this.maxStep * 0.3;
    this.target = clamp(this.target + delta, -overshoot, this.max + overshoot);
    this.lastWheel = now;
  }

  /** Discrete step to the next (+1) or previous (-1) slice. */
  step(direction: number) {
    const base = Math.round(this.target);
    this.goTo(base + Math.sign(direction));
  }

  goTo(index: number) {
    this.target = clamp(Math.round(index), 0, this.max);
    this.lastWheel = -Infinity;
  }

  update(dt: number, now = performance.now()) {
    if (now - this.lastWheel > this.settleDelay) {
      // Settle on the nearest moment once input has stopped.
      this.target = clamp(Math.round(this.target), 0, this.max);
    }
    this.spring.update(this.target, dt);
    return this.position;
  }

  /** Jump without animation (used for reduced motion and restoring state). */
  jump(index: number) {
    this.target = clamp(index, 0, this.max);
    this.spring.settle(this.target);
  }
}

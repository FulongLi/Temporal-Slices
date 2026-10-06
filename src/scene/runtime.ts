import { createContext, useContext, useSyncExternalStore } from "react";
import {
  createTemporalStore,
  createVolumeLayout,
  dominantMoment,
  initialState,
  sampleSlices,
  Spring,
  TemporalNavigation,
  TemporalWaves,
  transitionTiming,
  type ObserverOrbit,
  type ObserverPose,
  type SliceSampling,
  type TemporalDataset,
  type TemporalLayout,
  type TemporalState,
  type TemporalStore,
  type TransitionTiming,
  type Vec3,
} from "../engine";
import { TemporalVolumeTextures } from "../volume/TemporalVolumeTextures";

/** Number of temporal slices the volume is built from. */
export const SLICE_COUNT = 512;

export interface FocusSlot {
  /** Slice index, or -1 when empty. */
  index: number;
  /** 0 = resting in the block, 1 = extracted. */
  amount: number;
  spring: Spring;
}

/**
 * Per-frame state shared by the scene, outside React.
 *
 * Discrete interaction state (mode, focus, hover) lives in the store and
 * re-renders only the HUD. Continuous values (travel position, focus
 * extraction, waves, transition progress) change every frame and are read
 * directly from here inside useFrame, so the 3D scene never re-renders React.
 */
export interface TemporalRuntime {
  dataset: TemporalDataset;
  store: TemporalStore;
  navigation: TemporalNavigation;
  textures: TemporalVolumeTextures;
  layout: TemporalLayout;
  sampling: SliceSampling;
  waves: TemporalWaves;
  reducedMotion: boolean;
  timing: TransitionTiming;
  /** Pointer position in normalised device coordinates, and whether it is over the stage. */
  pointer: { x: number; y: number; inside: boolean };
  /** Where input wants the view to be (drag, pinch); the camera eases toward it. */
  orbit: ObserverOrbit;
  /** Seconds since the volume appeared. */
  clock: number;
  /** 0..1 as the volume assembles and the observer arrives. */
  intro: number;
  /**
   * The extracted slice and, while focus moves elsewhere, the one sliding
   * back into the block.
   */
  focus: { current: FocusSlot; previous: FocusSlot };
  transition: {
    /** 0 = in the volume, 1 = inside the moment. */
    progress: number;
    /** Camera pose when the passage began. */
    start: ObserverPose | null;
    center: Vec3 | null;
    normal: Vec3 | null;
    cover: number;
    sliceScale: number;
    entrySlope: number;
  };
  /** Values computed each frame, for shaders, effects and HUD. */
  frame: { flare: number; distort: number; speed: number; travel: number };
  /** The moment slice `index` mostly shows. */
  momentOf(index: number): number;
}

const slot = (): FocusSlot => ({ index: -1, amount: 0, spring: new Spring(0, 5.2, 0.92) });

export function createRuntime(
  dataset: TemporalDataset,
  options: { reducedMotion: boolean; baseUrl: string; start?: number; count?: number },
): TemporalRuntime {
  const count = options.count ?? SLICE_COUNT;
  const layout = createVolumeLayout({ count, aspect: dataset.aspect ?? 1.6 });
  const sampling = sampleSlices(dataset, count);
  const start = options.start ?? 0;
  const store = createTemporalStore(initialState(start));
  const navigation = new TemporalNavigation({
    count,
    start,
    stiffness: options.reducedMotion ? 22 : 4.2,
    // A full sweep through the block is roughly 4,000 px of scrolling.
    wheelScale: count / 4000,
    maxStep: count / 12,
  });
  return {
    dataset,
    store,
    navigation,
    textures: new TemporalVolumeTextures(dataset, options.baseUrl),
    layout,
    sampling,
    waves: new TemporalWaves({ count }),
    reducedMotion: options.reducedMotion,
    timing: transitionTiming(options.reducedMotion),
    pointer: { x: 0, y: 0, inside: false },
    orbit: { yaw: 0, pitch: 0, zoom: 1 },
    clock: 0,
    intro: options.reducedMotion ? 1 : 0,
    focus: { current: slot(), previous: slot() },
    transition: { progress: 0, start: null, center: null, normal: null, cover: 1, sliceScale: 1, entrySlope: 1 },
    frame: { flare: 0, distort: 0, speed: 0, travel: 0 },
    momentOf: (index) => dominantMoment(sampling, index),
  };
}

export const RuntimeContext = createContext<TemporalRuntime | null>(null);

export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("useRuntime must be used inside a RuntimeContext provider.");
  return runtime;
}

export function useTemporalState<T>(select: (state: TemporalState) => T): T {
  const { store } = useRuntime();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

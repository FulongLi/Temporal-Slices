import { createContext, useContext, useSyncExternalStore } from "react";
import type { ShaderMaterial } from "three";
import {
  createTemporalStore,
  initialState,
  LAYOUTS,
  layoutForAspect,
  TemporalNavigation,
  transitionTiming,
  type ObserverPose,
  type SlicePlacement,
  type TemporalDataset,
  type TemporalLayout,
  type TemporalState,
  type TemporalStore,
  type TransitionTiming,
  type Vec3,
} from "../engine";
import { SliceTextureStore } from "./SliceTextureStore";

/**
 * Per-frame state shared by the scene, outside React.
 *
 * Discrete interaction state (mode, focus, hover) lives in the store and
 * re-renders only the HUD. Continuous values (travel position, transition
 * progress, animated placements) change every frame and are read directly
 * from here inside useFrame, so the 3D field never re-renders React.
 */
export interface TemporalRuntime {
  dataset: TemporalDataset;
  store: TemporalStore;
  navigation: TemporalNavigation;
  textures: SliceTextureStore;
  layouts: TemporalLayout[];
  reducedMotion: boolean;
  timing: TransitionTiming;
  /** Pointer position in normalised device coordinates. */
  pointer: { x: number; y: number };
  /** Seconds since the field appeared. */
  clock: number;
  /** Current animated placement of every slice (morphs between layouts). */
  placements: SlicePlacement[];
  /** Each slice's material, so the membrane can mirror the focused one. */
  materials: (ShaderMaterial | null)[];
  transition: {
    /** 0 = in the field, 1 = inside the moment. */
    progress: number;
    /** Camera pose when the passage began. */
    start: ObserverPose | null;
    center: Vec3 | null;
    normal: Vec3 | null;
    cover: number;
    sliceScale: number;
    entrySlope: number;
  };
  /** Values computed by the camera each frame, for effects and HUD. */
  frame: { flare: number; distort: number; speed: number };
  layout(): TemporalLayout;
}

export function createRuntime(dataset: TemporalDataset, options: { reducedMotion: boolean; baseUrl: string; start?: number }): TemporalRuntime {
  const aspect = dataset.aspect ?? 1.6;
  const layouts = LAYOUTS.map((layout) => layoutForAspect(layout, aspect));
  const start = options.start ?? 0;
  const store = createTemporalStore(initialState(layouts[0].name, start));
  const navigation = new TemporalNavigation({
    count: dataset.slices.length,
    start,
    stiffness: options.reducedMotion ? 22 : 6.5,
  });
  const runtime: TemporalRuntime = {
    dataset,
    store,
    navigation,
    textures: new SliceTextureStore(dataset, options.baseUrl),
    layouts,
    reducedMotion: options.reducedMotion,
    timing: transitionTiming(options.reducedMotion),
    pointer: { x: 0, y: 0 },
    clock: 0,
    placements: dataset.slices.map((_, i) => layouts[0].placement(i)),
    materials: dataset.slices.map(() => null),
    transition: { progress: 0, start: null, center: null, normal: null, cover: 1, sliceScale: 1, entrySlope: 1 },
    frame: { flare: 0, distort: 0, speed: 0 },
    layout() {
      const name = store.getState().layout;
      return layouts.find((l) => l.name === name) ?? layouts[0];
    },
  };
  return runtime;
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

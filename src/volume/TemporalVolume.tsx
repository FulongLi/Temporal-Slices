import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector2, type Mesh, type PerspectiveCamera } from "three";
import {
  clamp,
  damp,
  ENTER_GROW,
  fieldPhase,
  FOCUS_GROW,
  pickSlice,
  rayHitsSlice,
  slicePose,
  smoothstep,
  Spring,
  SWAP_POINT,
  vec3,
} from "../engine";
import { useRuntime } from "../scene/runtime";
import { createVolumeGeometry } from "./TemporalVolumeGeometry";
import { createVolumeMaterial, exposureGain, volumeUniforms, WAVE_SLOTS } from "./TemporalVolumeMaterial";

/**
 * The whole archive as one object: every slice of the volume in a single
 * instanced draw call. This component only turns engine state into
 * uniforms and works out which slice the pointer is over; all geometry,
 * motion and light happen on the GPU.
 */
export function TemporalVolume() {
  const runtime = useRuntime();
  const { layout, sampling, textures } = runtime;
  const mesh = useRef<Mesh>(null);
  const volume = useMemo(() => createVolumeGeometry(sampling), [sampling]);
  const material = useMemo(
    () => createVolumeMaterial({ layout, images: textures.array, blank: textures.blank }),
    [layout, textures],
  );
  useEffect(
    () => () => {
      volume.dispose();
      material.dispose();
    },
    [volume, material],
  );

  const waves = useMemo(() => new Float32Array(WAVE_SLOTS * 4), []);
  const ndc = useMemo(() => new Vector2(), []);
  const hover = useRef({ index: -1, spring: new Spring(0, 9, 1) });
  const high = useRef(0);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const m = mesh.current;
    if (!m) return;
    const T = runtime.transition;
    m.visible = T.progress < SWAP_POINT;
    if (!m.visible) return;

    const camera = state.camera as PerspectiveCamera;
    const s = runtime.store.getState();
    const nav = runtime.navigation;
    const u = volumeUniforms(material);
    const { current: cur, previous: prev } = runtime.focus;
    const passage = T.progress > 0 || s.mode === "entering";
    const phase = fieldPhase(T.progress);

    volume.sortFor(layout.sliceAt(camera.position.z));

    u.uTime.value = runtime.clock;
    const devicePx = state.size.height * state.viewport.dpr;
    u.uPixelScale.value = (devicePx * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    u.uCursor.value = nav.position;
    u.uTravel.value = runtime.frame.travel;
    u.uIntro.value = smoothstep(0, 0.75, runtime.intro);
    u.uDim.value = passage ? phase.dim : 0;
    u.uGain.value = damp(u.uGain.value, exposureGain(textures.meanLuminance()), 3, dt);

    runtime.waves.write(waves);
    u.uWaves.value.forEach((v, i) => v.fromArray(waves, i * 4));

    u.uFocus.value.set(cur.index, cur.index >= 0 ? cur.amount : 0, prev.index, prev.index >= 0 ? prev.amount : 0);
    u.uFocusScale.value.set(1 + FOCUS_GROW * cur.amount + (passage ? ENTER_GROW * phase.lift : 0), 1 + FOCUS_GROW * prev.amount);
    u.uEnter.value.set(
      passage ? 0.2 * cur.amount + phase.distort * 1.3 : 0.2 * cur.amount,
      passage ? phase.distort * 0.35 : 0,
      0,
    );

    // Full resolution for the focused slice once its moments have arrived.
    if (cur.index >= 0) {
      const a = sampling.a[cur.index];
      const b = sampling.b[cur.index];
      const blend = sampling.blend[cur.index];
      const ha = textures.high[a];
      const hb = textures.high[b];
      const ready = (blend > 0.999 || ha !== null) && (blend < 0.001 || hb !== null);
      u.uHighA.value = ha ?? hb ?? textures.blank;
      u.uHighB.value = hb ?? ha ?? textures.blank;
      high.current = ready ? damp(high.current, 1, 4, dt) : 0;
    } else high.current = 0;
    u.uHighReady.value = high.current;

    // Pointing: the extracted slice first, then wherever the ray enters the
    // visible block (the present face, or a deeper slice through a side).
    let picked: number | null = null;
    const browsing = s.mode === "observe" || s.mode === "focus";
    if (browsing && runtime.pointer.inside && runtime.intro > 0.6) {
      ndc.set(runtime.pointer.x, runtime.pointer.y);
      state.raycaster.setFromCamera(ndc, camera);
      const { origin: o, direction: d } = state.raycaster.ray;
      const origin = vec3(o.x, o.y, o.z);
      const dir = vec3(d.x, d.y, d.z);
      if (cur.index >= 0 && cur.amount > 0.5) {
        const pose = slicePose(layout, cur.index, cur.amount);
        if (rayHitsSlice(pose, layout.sliceWidth, layout.sliceHeight, origin, dir)) picked = cur.index;
      }
      if (picked === null) picked = pickSlice(layout, origin, dir, clamp(nav.position - 0.5, 0, layout.count - 1));
    }
    if (picked !== s.hover) {
      runtime.store.dispatch({ type: "hover", index: picked });
      document.body.style.cursor = picked !== null ? "pointer" : "";
    }
    const h = hover.current;
    if (picked !== null && picked !== cur.index) h.index = picked;
    const amount = h.spring.update(picked !== null && picked !== cur.index ? 1 : 0, dt);
    u.uHover.value.set(h.index, clamp(amount));
  });

  return <mesh ref={mesh} geometry={volume.geometry} material={material} frustumCulled={false} raycast={() => null} />;
}

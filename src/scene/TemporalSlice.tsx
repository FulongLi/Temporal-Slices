import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  type Group,
  type Intersection,
  type PlaneGeometry,
  type Raycaster,
} from "three";
import {
  clamp,
  computeLOD,
  damp,
  fieldPhase,
  lerp,
  lerpAngle,
  slicePose,
  smoothstep,
  Spring,
} from "../engine";
import { createLabelTexture, LABEL_ASPECT } from "./labelTexture";
import { useRuntime } from "./runtime";
import { createSliceMaterial, uniformsOf } from "./sliceMaterial";

const LABEL_WIDTH = 0.62;

interface Props {
  index: number;
  geometry: PlaneGeometry;
  labelGeometry: PlaneGeometry;
  fontsReady: boolean;
}

/**
 * One moment in the field. It owns no data about what it depicts: it reads
 * its slice record, asks the texture store for imagery, and turns the
 * engine's continuous values (detail, focus, travel) into uniforms.
 */
export function TemporalSlice({ index, geometry, labelGeometry, fontsReady }: Props) {
  const runtime = useRuntime();
  const slice = runtime.dataset.slices[index];
  const group = useRef<Group>(null);
  const reflection = useRef<Group>(null);
  const label = useRef<Mesh>(null);
  const interactive = useRef(false);
  const state = useRef({
    focus: new Spring(0, 6.5, 1),
    hover: new Spring(0, 11, 1),
    bend: new Spring(0, 7.5, 0.42),
    dim: 0,
    low: 0,
    high: 0,
  });

  const layout = runtime.layout();
  const material = useMemo(
    () =>
      createSliceMaterial({
        blank: runtime.textures.blank,
        width: layout.sliceWidth,
        height: layout.sliceHeight,
        seed: (index * 0.618034) % 1,
        floorY: layout.floorY,
      }),
    // Geometry size is shared by every layout; the material lives as long as the slice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    runtime.materials[index] = material;
    return () => {
      runtime.materials[index] = null;
      material.dispose();
    };
  }, [index, material, runtime]);

  const labelMaterial = useMemo(() => {
    const map = createLabelTexture(slice.timeLabel, slice.phase);
    return new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 });
    // Redraw once webfonts are available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice.timeLabel, slice.phase, fontsReady]);
  useEffect(() => () => {
    labelMaterial.map?.dispose();
    labelMaterial.dispose();
  }, [labelMaterial]);

  // Only slices that are actually visible may be picked by the pointer.
  const raycast = useMemo(
    () =>
      function (this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
        if (interactive.current) Mesh.prototype.raycast.call(this, raycaster, intersects);
      },
    [],
  );

  useFrame((frame, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = group.current;
    const r = reflection.current;
    if (!g || !r) return;
    const s = runtime.store.getState();
    const layout = runtime.layout();
    const nav = runtime.navigation;
    const T = runtime.transition;
    const u = uniformsOf(material);
    const local = state.current;

    // Layout morph: drift toward this layout's placement.
    const target = layout.placement(index);
    const place = runtime.placements[index];
    const k = runtime.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.6);
    place.position = {
      x: lerp(place.position.x, target.position.x, k),
      y: lerp(place.position.y, target.position.y, k),
      z: lerp(place.position.z, target.position.z, k),
    };
    place.yaw = lerpAngle(place.yaw, target.yaw, k);

    const lod = computeLOD(index - nav.position);
    const isFocus = s.focus === index && s.mode !== "observe";
    const passage = T.progress > 0 || s.mode === "entering";
    const phase = fieldPhase(T.progress);
    const browsing = s.mode === "observe" || s.mode === "focus";

    let focus = local.focus.update(isFocus ? 1 : 0, dt);
    if (isFocus && passage) focus = Math.max(focus, phase.lift);
    focus = clamp(focus);
    const hover = clamp(local.hover.update(s.hover === index && !isFocus && browsing ? 1 : 0, dt));

    // Observing one moment darkens the others.
    const elsewhere = s.focus !== null && s.mode !== "observe" && !isFocus;
    local.dim = damp(local.dim, elsewhere ? 0.34 : 0, 4.5, dt);
    const dim = elsewhere && passage ? Math.max(local.dim, lerp(0.34, 1, phase.dim)) : local.dim;

    // Spacetime reacts to observation: nearby slices bow, neighbours of a
    // focused slice lean toward it, travel drags every membrane.
    let bendTarget = lod.near * 0.22 + hover * 0.14 + (isFocus ? 0.2 : 0);
    if (elsewhere && s.focus !== null) {
      const d = index - s.focus;
      if (Math.abs(d) <= 3) bendTarget += (Math.sign(d) * 0.6) / Math.pow(Math.abs(d), 1.25);
    }
    const bend = runtime.reducedMotion ? bendTarget * 0.4 : local.bend.update(bendTarget, dt);
    const drag = runtime.reducedMotion ? 0 : clamp(-nav.velocity * 0.2, -0.65, 0.65) * (1 - focus);

    const intro = runtime.reducedMotion
      ? 1
      : smoothstep(0, 1.8, runtime.clock - 0.5 - Math.max(0, index - nav.position) * 0.07);
    const visibility = Math.max(lod.visibility, focus) * intro;
    const detail = Math.max(lod.detail, focus);

    // Imagery: small texture always, full resolution only when worth it.
    const textures = runtime.textures;
    if (lod.wantsHighRes || isFocus) textures.wantHigh(index, performance.now());
    const low = textures.low[index];
    const high = textures.high[index];
    local.low = damp(local.low, low ? 1 : 0, 3, dt);
    local.high = damp(local.high, high ? 1 : 0, 4, dt);
    u.uMapLow.value = low ?? textures.blank;
    u.uMapHigh.value = high ?? low ?? textures.blank;
    u.uLowReady.value = local.low;
    u.uHigh.value = local.high;
    u.uTint.value.copy(textures.tint[index]);

    u.uDetail.value = detail;
    u.uFocus.value = focus;
    u.uHover.value = hover;
    u.uDim.value = dim;
    u.uVisibility.value = visibility;
    u.uTime.value = frame.clock.elapsedTime;
    u.uBend.value = bend + (isFocus ? phase.distort * 0.35 : 0);
    u.uDrag.value = drag;
    u.uRipple.value = isFocus ? 0.2 * focus + phase.distort * 1.3 : hover * 0.35;
    u.uFloorY.value = layout.floorY;

    const pose = slicePose(layout, index, place, focus, isFocus && passage ? phase.lift : 0);
    g.position.set(pose.position.x, pose.position.y, pose.position.z);
    g.rotation.y = pose.yaw;
    g.scale.setScalar(pose.scale);
    r.position.set(pose.position.x, 2 * layout.floorY - pose.position.y, pose.position.z);
    r.rotation.y = pose.yaw;
    r.scale.set(pose.scale, -pose.scale, pose.scale);

    const shown = visibility > 0.003;
    g.visible = shown;
    r.visible = shown;
    interactive.current = browsing && visibility > 0.25 && lod.detail > 0.06;

    if (label.current) {
      const m = label.current.material as MeshBasicMaterial;
      const readable = smoothstep(0.35, 0.85, lod.detail) * 0.5 + focus * 0.5 + hover * 0.35;
      m.opacity = clamp(readable) * visibility * (1 - dim * 0.85) * (1 - phase.dim * (isFocus ? 1 : 0));
      label.current.visible = m.opacity > 0.004;
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    runtime.store.dispatch({ type: "hover", index });
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    if (runtime.store.getState().hover === index) runtime.store.dispatch({ type: "hover", index: null });
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    runtime.navigation.goTo(index);
    runtime.store.dispatch({ type: "select", index });
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    runtime.navigation.goTo(index);
    runtime.store.dispatch({ type: "enter", index });
  };

  const labelHeight = LABEL_WIDTH / LABEL_ASPECT;
  return (
    <>
      <group ref={group}>
        <mesh
          geometry={geometry}
          material={material}
          raycast={raycast}
          onPointerOver={onOver}
          onPointerOut={onOut}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
        <mesh
          ref={label}
          geometry={labelGeometry}
          material={labelMaterial}
          raycast={() => null}
          position={[-layout.sliceWidth / 2 + LABEL_WIDTH / 2, -layout.sliceHeight / 2 - labelHeight / 2 - 0.05, 0.002]}
          scale={[LABEL_WIDTH, labelHeight, 1]}
        />
      </group>
      <group ref={reflection}>
        <mesh geometry={geometry} material={material} raycast={() => null} />
      </group>
    </>
  );
}

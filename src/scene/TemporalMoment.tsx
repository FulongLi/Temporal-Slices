import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { MeshBasicMaterial, PlaneGeometry, type Group, type Mesh, type PerspectiveCamera, type Texture } from "three";
import { MEMBRANE_DISTANCE, MOMENT_DEPTH, lerp, momentPhase, smoothstep, SWAP_POINT } from "../engine";
import { Dust } from "./Dust";
import { useRuntime, useTemporalState } from "./runtime";
import { MOMENT_ORIGIN } from "./constants";
import { copySliceUniforms, createSliceMaterial, uniformsOf } from "./sliceMaterial";

/** Nearest and farthest layer distances from the resting camera. */
const LAYER_NEAR = 3.6;
const LAYER_FAR = 16;
/** Extra coverage so looking around never reveals a layer's edge. */
const OVERSCAN = 1.3;

/**
 * The inside of a slice: a simple scene for one moment.
 *
 * The membrane is the slice surface again, sized so that from the moment
 * camera it covers the view exactly as the slice did in the field. Behind it
 * the moment's depth layers stand at increasing distances, so once the
 * camera passes through, the image opens into parallax space.
 */
export function TemporalMoment() {
  const runtime = useRuntime();
  const focus = useTemporalState((s) => s.focus);
  const group = useRef<Group>(null);
  const membrane = useRef<Mesh>(null);
  const layerMeshes = useRef<(Mesh | null)[]>([]);
  const size = useThree((s) => s.size);
  const layout = runtime.layout();

  const [layers, setLayers] = useState<{ index: number; textures: Texture[] } | null>(null);
  useEffect(() => {
    if (focus === null) return;
    let alive = true;
    runtime.textures
      .layers(focus)
      .then((textures) => alive && setLayers({ index: focus, textures }))
      .catch((error) => console.warn(error));
    return () => {
      alive = false;
    };
  }, [focus, runtime]);

  const geometry = useMemo(() => new PlaneGeometry(layout.sliceWidth, layout.sliceHeight, 48, 24), [layout.sliceWidth, layout.sliceHeight]);
  const unit = useMemo(() => new PlaneGeometry(1, 1), []);
  const membraneMaterial = useMemo(
    () =>
      createSliceMaterial({
        blank: runtime.textures.blank,
        width: layout.sliceWidth,
        height: layout.sliceHeight,
        seed: 0.5,
        floorY: -1e6,
      }),
    [runtime, layout.sliceWidth, layout.sliceHeight],
  );
  const layerMaterials = useMemo(
    () =>
      (layers?.textures ?? []).map(
        (map) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: true }),
      ),
    [layers],
  );
  useEffect(() => () => layerMaterials.forEach((m) => m.dispose()), [layerMaterials]);
  useEffect(
    () => () => {
      geometry.dispose();
      unit.dispose();
      membraneMaterial.dispose();
    },
    [geometry, unit, membraneMaterial],
  );

  useFrame((state) => {
    const T = runtime.transition;
    const g = group.current;
    if (!g) return;
    g.visible = T.progress >= SWAP_POINT;
    if (!g.visible) return;
    const s = runtime.store.getState();
    const camera = state.camera as PerspectiveCamera;
    const m = momentPhase(T.progress, T.entrySlope);

    // The membrane mirrors the focused slice, then reacts to contact.
    const source = s.focus !== null ? runtime.materials[s.focus] : null;
    if (source) copySliceUniforms(source, membraneMaterial);
    const u = uniformsOf(membraneMaterial);
    u.uDim.value = 0;
    u.uFogDensity.value = 0;
    u.uVisibility.value = m.membrane;
    u.uFlare.value = m.flare * 0.65;
    u.uRipple.value += m.ripple * 1.6;
    u.uBend.value += m.ripple * 0.4;
    if (membrane.current) {
      membrane.current.position.set(0, 0, -MEMBRANE_DISTANCE);
      membrane.current.scale.setScalar((T.sliceScale * MEMBRANE_DISTANCE) / T.cover);
      membrane.current.visible = m.membrane > 0.002;
    }

    // Depth layers, each covering the view from the resting camera.
    const rest = -(MEMBRANE_DISTANCE + MOMENT_DEPTH);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const aspect = size.width / Math.max(1, size.height);
    const imageAspect = runtime.dataset.aspect ?? 1.6;
    const count = layerMaterials.length;
    const reveal = smoothstep(0, 0.35, m.q);
    layerMeshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const distance = count === 1 ? (LAYER_NEAR + LAYER_FAR) / 2 : lerp(LAYER_FAR, LAYER_NEAR, i / (count - 1));
      const height = Math.max(2 * distance * tan, (2 * distance * tan * aspect) / imageAspect) * OVERSCAN;
      mesh.position.set(0, 0, rest - distance);
      mesh.scale.set(height * imageAspect, height, 1);
      (mesh.material as MeshBasicMaterial).opacity = reveal;
    });
  });

  const ready = layers && layers.index === focus;
  return (
    <group ref={group} position={MOMENT_ORIGIN.toArray()} visible={false}>
      {ready &&
        layerMaterials.map((material, i) => (
          <mesh
            key={i}
            ref={(mesh) => {
              layerMeshes.current[i] = mesh;
            }}
            geometry={unit}
            material={material}
            renderOrder={i}
            raycast={() => null}
          />
        ))}
      <mesh ref={membrane} geometry={geometry} material={membraneMaterial} renderOrder={20} raycast={() => null} />
      <Dust count={700} box={[6, 4, 10]} color="#ffe6c4" size={0.8} fog={0.02} speed={runtime.reducedMotion ? 0 : 1} />
    </group>
  );
}

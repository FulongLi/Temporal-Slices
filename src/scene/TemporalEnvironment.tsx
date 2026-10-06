import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type Group,
  type Mesh,
} from "three";
import { SWAP_POINT } from "../engine";
import floorFragment from "../shaders/floor.frag.glsl?raw";
import floorVertex from "../shaders/floor.vert.glsl?raw";
import { Dust } from "./Dust";
import { useRuntime } from "./runtime";
import { BACKGROUND, FOG_DENSITY } from "./constants";

/**
 * The space the archive occupies: a dark floor with a faint survey grid,
 * the luminous time axis with a tick under each moment, and drifting motes.
 */
export function TemporalEnvironment() {
  const runtime = useRuntime();
  const group = useRef<Group>(null);
  const floor = useRef<Mesh>(null);
  const count = runtime.dataset.slices.length;

  const floorMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: floorVertex,
        fragmentShader: floorFragment,
        depthWrite: false,
        uniforms: {
          uColor: { value: new Color(BACKGROUND).offsetHSL(0, 0, 0.004) },
          uLine: { value: new Color("#7fb0ff") },
          uFogDensity: { value: FOG_DENSITY },
        },
      }),
    [],
  );
  const floorGeometry = useMemo(() => new PlaneGeometry(240, 240).rotateX(-Math.PI / 2), []);

  // The axis is rebuilt from the slices' animated placements every frame,
  // so it follows them when the layout changes.
  const axis = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array((count + 2) * 3), 3));
    return g;
  }, [count]);
  const ticks = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 2 * 3), 3));
    return g;
  }, [count]);
  const axisMaterial = useMemo(
    () => new LineBasicMaterial({ color: "#6fa6ff", transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }),
    [],
  );
  const axisLine = useMemo(() => {
    const line = new Line(axis, axisMaterial);
    line.frustumCulled = false;
    return line;
  }, [axis, axisMaterial]);
  const tickMaterial = useMemo(
    () => new LineBasicMaterial({ color: "#a9cbff", transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      [floorMaterial, floorGeometry, axis, ticks, axisMaterial, tickMaterial].forEach((d) => d.dispose());
    },
    [floorMaterial, floorGeometry, axis, ticks, axisMaterial, tickMaterial],
  );

  useFrame(() => {
    const visible = runtime.transition.progress < SWAP_POINT;
    if (group.current) group.current.visible = visible;
    if (!visible) return;
    const layout = runtime.layout();
    const y = layout.floorY + 0.003;
    if (floor.current) floor.current.position.y = layout.floorY;
    const a = axis.attributes.position as BufferAttribute;
    const t = ticks.attributes.position as BufferAttribute;
    const p = runtime.placements;
    // Extend the axis beyond both ends of the archive.
    const first = p[0].position;
    const second = p[1].position;
    const last = p[count - 1].position;
    const before = p[count - 2].position;
    a.setXYZ(0, first.x + (first.x - second.x) * 6, y, first.z + (first.z - second.z) * 6);
    for (let i = 0; i < count; i++) {
      const { position, yaw } = p[i];
      a.setXYZ(i + 1, position.x, y, position.z);
      const cx = Math.cos(yaw) * 0.32;
      const cz = -Math.sin(yaw) * 0.32;
      t.setXYZ(i * 2, position.x - cx, y, position.z - cz);
      t.setXYZ(i * 2 + 1, position.x + cx, y, position.z + cz);
    }
    a.setXYZ(count + 1, last.x + (last.x - before.x) * 30, y, last.z + (last.z - before.z) * 30);
    a.needsUpdate = true;
    t.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh ref={floor} geometry={floorGeometry} material={floorMaterial} renderOrder={-10} raycast={() => null} />
      <lineSegments geometry={ticks} material={tickMaterial} frustumCulled={false} />
      <primitive object={axisLine} />
      <Dust speed={runtime.reducedMotion ? 0 : 1} />
    </group>
  );
}

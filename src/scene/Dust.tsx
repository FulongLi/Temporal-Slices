import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from "three";
import fragmentShader from "../shaders/dust.frag.glsl?raw";
import vertexShader from "../shaders/dust.vert.glsl?raw";
import { FOG_DENSITY } from "./constants";

interface Props {
  count?: number;
  box?: [number, number, number];
  color?: string;
  size?: number;
  fog?: number;
  /** Seconds of drift per real second; 0 freezes the motes. */
  speed?: number;
}

/** Motes suspended in the archive, wrapped around the observer. */
export function Dust({ count = 1400, box = [14, 7, 20], color = "#9cc6ff", size = 1, fog = FOG_DENSITY, speed = 1 }: Props) {
  const camera = useThree((s) => s.camera);
  const dpr = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions.set([Math.random(), Math.random(), Math.random()], i * 3);
      seeds[i] = Math.random();
    }
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new Vector3() },
          uBox: { value: new Vector3(...box) },
          uPixelRatio: { value: dpr },
          uFogDensity: { value: fog },
          uSize: { value: size },
          uColor: { value: new Color(color) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.1) * speed;
    material.uniforms.uCenter.value.copy(camera.position);
    material.uniforms.uPixelRatio.value = dpr;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

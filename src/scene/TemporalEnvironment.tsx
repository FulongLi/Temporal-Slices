import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { SWAP_POINT } from "../engine";
import { Dust } from "./Dust";
import { useRuntime } from "./runtime";

/**
 * The space around the volume: darkness, and a sparse haze of motes that
 * gives the air depth. No floor, grid, axis or labels: the volume itself is
 * the only thing that speaks about time.
 */
export function TemporalEnvironment() {
  const runtime = useRuntime();
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.visible = runtime.transition.progress < SWAP_POINT;
  });
  return (
    <group ref={group}>
      <Dust count={420} box={[34, 18, 40]} color="#86a9e6" size={0.7} fog={0.02} speed={runtime.reducedMotion ? 0 : 0.6} />
    </group>
  );
}

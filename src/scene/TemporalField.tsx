import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlaneGeometry, type Group } from "three";
import { SWAP_POINT } from "../engine";
import { useRuntime } from "./runtime";
import { TemporalSlice } from "./TemporalSlice";

/** All slices of the archive, sharing one segmented geometry. */
export function TemporalField() {
  const runtime = useRuntime();
  const group = useRef<Group>(null);
  const { sliceWidth, sliceHeight } = runtime.layout();
  // Segmented so the vertex shader can bend the surface smoothly.
  const geometry = useMemo(() => new PlaneGeometry(sliceWidth, sliceHeight, 48, 24), [sliceWidth, sliceHeight]);
  const labelGeometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => labelGeometry.dispose(), [labelGeometry]);

  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts
      ?.load('300 76px "IBM Plex Mono"')
      .then(() => alive && setFontsReady(true))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useFrame(() => {
    if (group.current) group.current.visible = runtime.transition.progress < SWAP_POINT;
  });

  return (
    <group ref={group}>
      {runtime.dataset.slices.map((slice, index) => (
        <TemporalSlice key={slice.id} index={index} geometry={geometry} labelGeometry={labelGeometry} fontsReady={fontsReady} />
      ))}
    </group>
  );
}

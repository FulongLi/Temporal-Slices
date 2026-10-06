import { useEffect, useMemo, useState } from "react";
import type { DatasetRegistry } from "../data";
import { normalizeDataset } from "../engine";
import { createRuntime, RuntimeContext } from "../scene/runtime";
import { TemporalScene } from "../scene/TemporalScene";
import { TemporalHUD, TemporalIntro } from "../ui/TemporalHUD";
import { useTemporalInput } from "../ui/useTemporalInput";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function App({ registry }: { registry: DatasetRegistry }) {
  const runtime = useMemo(() => {
    const { datasets, defaultId } = registry;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("dataset") ?? defaultId;
    const dataset = normalizeDataset(datasets[requested] ?? datasets[defaultId]);
    const count = Number(params.get("slices")) || undefined;
    return createRuntime(dataset, { reducedMotion: prefersReducedMotion(), baseUrl: import.meta.env.BASE_URL, count });
  }, [registry]);

  useEffect(() => {
    void runtime.textures.loadAll(runtime.momentOf(runtime.navigation.present));
    // Handy for inspecting the engine from the devtools console.
    if (import.meta.env.DEV) (window as unknown as { temporal: unknown }).temporal = runtime;
  }, [runtime]);

  const [stage, setStage] = useState<HTMLElement | null>(null);
  useTemporalInput(runtime, stage);

  return (
    <RuntimeContext.Provider value={runtime}>
      <main className="stage" ref={setStage}>
        <TemporalScene runtime={runtime} />
        <TemporalHUD />
        <TemporalIntro />
      </main>
    </RuntimeContext.Provider>
  );
}

import { useEffect, useMemo, useState } from "react";
import { datasets, defaultDatasetId } from "../data";
import { normalizeDataset } from "../engine";
import { createRuntime, RuntimeContext } from "../scene/runtime";
import { TemporalScene } from "../scene/TemporalScene";
import { TemporalHUD, TemporalIntro } from "../ui/TemporalHUD";
import { useTemporalInput } from "../ui/useTemporalInput";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function App() {
  const runtime = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("dataset") ?? defaultDatasetId;
    const dataset = normalizeDataset(datasets[requested] ?? datasets[defaultDatasetId]);
    return createRuntime(dataset, { reducedMotion: prefersReducedMotion(), baseUrl: import.meta.env.BASE_URL });
  }, []);

  useEffect(() => {
    void runtime.textures.loadLow(runtime.navigation.present);
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

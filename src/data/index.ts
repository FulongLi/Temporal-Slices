import lunarCity from "./lunar-city/dataset.json";

/**
 * Registered temporal datasets. The engine and renderer only ever see the
 * generic TemporalDataset shape; swapping the archive means adding an entry
 * here — nothing else changes.
 *
 * Local datasets live in `src/data/local/<id>/dataset.json` with their images
 * in `public/local/<id>/`. Both folders are ignored by Git, for imagery whose
 * reuse rights are unclear (see `npm run import:images`). They are available
 * in the dev server, and become the default there; production builds leave
 * them out unless built with VITE_INCLUDE_LOCAL=1.
 */
export interface DatasetRegistry {
  datasets: Record<string, unknown>;
  defaultId: string;
}

const includeLocal = import.meta.env.DEV || import.meta.env.VITE_INCLUDE_LOCAL === "1";

export async function loadDatasets(): Promise<DatasetRegistry> {
  const local: Record<string, unknown> = {};
  if (includeLocal) {
    const modules = import.meta.glob<unknown>("./local/*/dataset.json", { import: "default" });
    for (const [path, load] of Object.entries(modules)) local[path.split("/")[2]] = await load();
  }
  return {
    datasets: { "lunar-city": lunarCity, ...local },
    defaultId: Object.keys(local).sort()[0] ?? "lunar-city",
  };
}

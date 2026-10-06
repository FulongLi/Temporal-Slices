# Phase 1 archive

`generate-lunar-city.mjs` drew the Phase 1 demo: one fictional lunar settlement
at 40 moments (2031–2351), each as a composite SVG plus three depth layers.

Phase 2 renders a dense volume from a handful of source moments, so only 12 of
those moments ship with the app (`public/datasets/lunar-city/`, described by
`src/data/lunar-city/dataset.json`). The generator is kept for reference only.
Run from the repository root it would write all 40 moments back into
`public/datasets/lunar-city/` and a Phase 1 style `temporal-slices.json` (with a
`slices` key, which `normalizeDataset` still accepts); it is not part of the
build.

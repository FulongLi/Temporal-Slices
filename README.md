# Temporal Slices

**Time is not a timeline. Time is a space.**

Temporal Slices is an experimental WebGL interface for navigating time as a spatial structure.

Hundreds of extremely thin slices of time are packed into one translucent block. From a distance it is a single dense, luminous object. Closer, it turns out to be layered. Closer still, the layers are moments, and one of them can be drawn out of the block and entered.

Inspired by the temporal archive concept from *Moon Dark Side* (月球暗面).

## Live Demo

https://fulongli.github.io/Temporal-Slices/

Every push to `main` automatically deploys the latest build to GitHub Pages (see [Deployment](#deployment)).

---

## Concept

Phase 1 showed time as about forty large images standing in a corridor. That read as a photo gallery. Phase 2 follows one rule:

> Do not display temporal slices. Build a volume made of temporal slices.

The perceptual strategy comes from Undertow (`stream-implement-3d` in the reference project). There, 2,400 optical fibres read first as one curtain of light, and only on inspection as individual threads. Temporal Slices does the same with ~500 translucent membranes:

```
Far      one temporal volume            (the arrival: a small luminous object assembling)
Closer   visible layering               (the resting view: thickness, striations, light inside)
Closer   hundreds of temporal membranes (travel: the block is sectioned at the present)
Focus    one slice becomes readable     (it rises out of the block, the block opens a gap)
Enter    the slice becomes a portal     (the camera passes through it into the moment)
```

A few source images become hundreds of slices. Twelve lunar moments, or eight Death Valley spreads, are spread across 512 slices placed evenly in time. Each slice blends the two moments around it, so looking through the block you see one state of the world turning into the next.

## Running it

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then a production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Engine and dataset tests (Vitest) |
| `npm run import:images -- <folder> --id <id>` | Turn a folder of images into a local, untracked dataset (see below) |

URL parameters: `?dataset=<id>` picks an archive; `?slices=<n>` changes the slice count (default 512); `?quality=high|medium|low` sets the optical quality (default `high`).

### Deployment

Every push to `main` automatically deploys the latest build to GitHub Pages. [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) runs `npm ci`, `npm test` and `npm run build` with `VITE_BASE_PATH=/Temporal-Slices/`, then publishes `dist/` with the official Pages actions; it can also be run by hand (`workflow_dispatch`). The repository's Pages source must be set to **GitHub Actions** (Settings → Pages), not a branch.

Locally the base stays `/`. To check the Pages build under its subpath:

```bash
VITE_BASE_PATH=/Temporal-Slices/ npm run build
npx vite preview --base /Temporal-Slices/
```

Local, untracked imagery (`public/local/`, `src/data/local/`) is never published: production builds drop it unless `VITE_INCLUDE_LOCAL=1`, and CI never has it.

## Controls

| Input | Action |
| --- | --- |
| Scroll / trackpad (either axis) | Travel through time: the present moves through the block |
| Pinch (ctrl + wheel) | Come closer / step back, within limits |
| Drag | Lean the view to inspect the block's sides (limited, eases back on `Esc`) |
| Click | Draw the slice under the pointer out of the block (front face = the present; a side = the slice at that depth) |
| `Space` | Draw out the present slice |
| `→` `↓` `PageDown` / `←` `↑` `PageUp` | Observing: travel to the next / previous moment. Focused: move the extracted slice one slice through time (`Shift`: ten) |
| `Home` / `End` | Travel to the beginning / end |
| Double-click / `Enter` | Enter the slice |
| `Esc` | Leave the moment, release the slice, then reset the view |
| Touch drag | Travel |

With `prefers-reduced-motion`, travel is near-instant, the volume does not wave or breathe, the arrival is skipped, and the passage into a slice is short and direct.

## The experience

### Four states (unchanged from Phase 1)

```
 OBSERVE ──click──▶ FOCUS ──enter──▶ ENTERING ──▶ INSIDE
    ▲                 │  ▲              │  ▲          │
    └──────esc────────┘  └──── EXITING ◀┘  └───esc────┘
```

### The volume at rest

- **One body.** Each slice absorbs ~1.6% of the light behind it and emits a little of its own image. Blended back to front, one slice is almost invisible, twenty are a haze and two hundred are a solid body. This is an emission–absorption volume sampled at each slice.
- **Hidden images.** Unexamined slices sample their image through a heavily biased mip level, in desaturated, slightly cold colour. Seen obliquely through hundreds of them, an image becomes colour, light and smeared silhouettes, never a readable photograph.
- **Edges.** Every membrane has a soft edge line. Where slices pack closer than a pixel, each edge is weighted by its share of the pixel and drawn wider, so the faces of the block glow evenly instead of showing moiré. As the observer comes closer and slices separate on screen, the edges become distinct layers and the images sharpen. Like Undertow, disclosure follows *screen* spacing.
- **The present** is the cut face of the block. Slices already travelled through thin to a faint ghost, so the block appears sectioned where you are in time. The present slice is more opaque and a little clearer, and carries a luminous frame.
- **No interface.** No floor, grid, axis, ticks or labels. Only the archive's name remains. A date appears while travelling and fades when you stop; metadata appears only for a slice that has been drawn out.

### Motion

All motion is large-scale and collective. It is computed in the vertex shader as displacement measured in slices:

- **Travelling waves.** Every 9–15 s a wave packet enters one end of the block and passes through it. Layers bunch and spread along the time axis and bow slightly, and a faint band of light moves with the packet. The wave fades as it travels and the block is still again. Drawing a slice out sends a smaller pair of waves outward from it.
- **Breathing.** A very slow drift of density along the whole block.
- **Travel compression.** Moving through time compresses the block ahead of the present and stretches it behind, in proportion to speed.

### Focus: extracting a moment

1. The slice under the pointer brightens: its edge light comes up.
2. On click the present travels to it, and a gap opens. Neighbours are pushed away by up to ~22 slices, so the layers beyond compress against the rest of the block.
3. The slice rises out of the block like a card drawn from a deck, drifts slightly toward you and turns a little to face you. It becomes opaque and its image resolves at full resolution. The two moments it blends are streamed at 1800 px.
4. Its date, era, title and readings appear. Arrow keys slide the extracted slice through time one slice at a time, so you watch one moment crossfade into the next.
5. Double-click or `Enter` begins the passage.

### Enter Slice

Unchanged in principle from Phase 1 (`engine/TemporalTransition.ts`). One progress value drives the whole passage. The rest of the block dims; the camera closes in on the extracted slice until it covers the viewport; at the swap point the scene changes to the moment's own space, where a membrane showing the same blend of moments covers the view identically; the camera continues through it into the moment's depth layers. `Esc` runs the same curves backward.

### Optics (Phase 3)

> Temporal glass should not merely reflect light. It should separate, bend and carry light through time.

The block is no longer plain cold glass. At rest it stays mostly silver, black and pale blue; colour comes from viewing angle, movement, waves, focus and the passage.

- **Thin film.** Each membrane reflects a thin-film colour that depends on the view angle (the optical path through a film of index ~1.45, mapped through a cool-biased palette: deep blue, violet, cyan, pale green, then brief gold and magenta). Facing the block it is nearly transparent silver; toward grazing angles violet, cyan and green appear, and the colour shifts continuously as the camera moves. A slowly flowing film thickness and a drift through depth keep it from reading as one flat tint.
- **Colour from density.** The film is scaled by each slice's absorption, so one membrane barely tints, dozens make a faint haze, and hundreds become an optical body. It does not depend on how bright an archive's imagery is.
- **Waves carry light.** A passing wave carries a spectral pulse: violet ahead of the packet, cyan at its centre, gold behind, then fading back to silver. Breathing drifts the phase very slightly; camera movement and travel bring the colour up, and it calms again at rest.
- **Highlights.** A narrow anisotropic streak whose colour spreads across its width, and a soft silver reflection at grazing angles. Both accumulate where many layers overlap.
- **Light inside.** One wide cyan-violet band drifts slowly through the volume, and now and then a thin gold one appears at grazing angles. Faint caustics run through the body while it is disturbed, and a faint caustic glow lies in the dark beneath it (an invisible receiving plane, additive, with no edges).
- **Dispersion.** Edges separate into a fine fringe (red outermost) where hundreds of them merge at the silhouette. The clearest slices (present, hover, extracted) separate red and blue slightly around high-contrast features.
- **Focus.** The extracted slice's edge turns iridescent, a front of colour crosses it, and the image resolves beneath the film, leaving a faint iridescent frame. The neighbours on either side shift phase in opposite directions, fading with distance, so the extraction disturbs the surrounding medium.
- **The passage** (`passageOptics` in `engine/TemporalTransition.ts`): the membrane becomes iridescent; interference spreads from its centre; dispersion rises; as the camera meets the membrane an interference field (Newton's rings, bent by the image) covers the view; then colour resolves back into the moment. There is no white flash, and `Esc` plays it backward. With reduced motion, the field and dispersion are off.

All of it is tuned from one object, `SPECTRAL_LOOK` in `volume/SpectralLook.ts`. The shared shader functions (`fresnelTerm`, `spectralPalette`, `thinFilmColor`, `spectralBand`, `causticField`, `membraneFilm`) live in `shaders/spectral.glsl`.

## Architecture

```
Temporal Engine (pure TypeScript)        ← no Three.js, no React, unit-tested
        ↓
Temporal Volume Renderer (one draw call) ← instanced slices, GPU motion and interpolation
        ↓
Temporal Dataset (JSON + a few images)   ← any world: a city, a person, a landscape
```

```
src/
├── app/                         App wiring, styles
├── engine/                      ← knows nothing about rendering or content
│   ├── types.ts                 TemporalDataset, TemporalMomentData
│   ├── TemporalDataset.ts       validation, labels, phases
│   ├── TemporalVolume.ts        sampling: moments → slices (time, A, B, blend)
│   ├── TemporalLayout.ts        the volume's geometry, observer poses, picking
│   ├── TemporalFocus.ts         extraction pose, gap, ray test for the extracted slice
│   ├── TemporalWaves.ts         travelling waves through the block
│   ├── TemporalNavigation.ts    inertial travel along the time axis
│   ├── TemporalLOD.ts           which moments deserve full resolution
│   ├── TemporalState.ts         interaction state machine + tiny store
│   ├── TemporalTransition.ts    the Enter Slice timeline and camera path
│   └── math.ts
├── volume/                      ← the volume renderer
│   ├── TemporalVolume.tsx       engine state → uniforms, pointer picking
│   ├── TemporalVolumeGeometry.ts  instanced plane, per-instance attributes, draw order
│   ├── TemporalVolumeMaterial.ts  the shared material, look constants, exposure
│   ├── TemporalVolumeTextures.ts  texture array of moments, high-res and depth layers
│   ├── SpectralLook.ts            SPECTRAL_LOOK (optics tuning), quality levels
│   └── TemporalCaustics.tsx       faint caustic light beneath the block
├── shaders/
│   ├── spectral.glsl              shared optics: Fresnel, palette, thin film, bands, caustics, membrane film
│   ├── temporal-volume.vert.glsl  waves, compression, gap, extraction, appearance, optics
│   ├── temporal-volume.frag.glsl  image interpolation, memory, edges, absorption, focus film
│   ├── membrane.*.glsl            the surface crossed when entering a slice
│   ├── spectral-boundary.frag.glsl  screen-space dispersion and the passage's interference field
│   ├── caustics.*.glsl
│   └── dust.*.glsl
├── scene/                       ← R3F scene; knows nothing about lunar cities
│   ├── runtime.ts               per-frame shared state + React context
│   ├── TemporalScene.tsx        Canvas composition, adaptive DPR
│   ├── TemporalDirector.tsx     advances travel, focus, waves, transition, streaming
│   ├── TemporalCamera.tsx       arrival, oblique rest, focus, passage, inside
│   ├── TemporalEnvironment.tsx  darkness and a sparse haze of motes
│   ├── TemporalMoment.tsx       the inside of a slice: membrane + depth layers
│   ├── TemporalEffects.tsx      bloom, spectral boundary, tone mapping, grain
│   └── SpectralBoundaryEffect.ts  post effect: wavelengths separating in motion, the passage's interference
├── ui/                          HUD and input
└── data/                        dataset registry; lunar-city/dataset.json
scripts/import-images.mjs        folder of images → local dataset
archive/phase-1/                 the Phase 1 demo generator, for reference
```

### Rendering

- **One draw call.** The volume is a single `InstancedBufferGeometry`: one 24×14 segmented unit plane, instanced 512 times, with a single `ShaderMaterial`. Per-instance attributes are `aSlice` (index), `aImage` (moment A, moment B, blend) and `aSeed`. Everything else comes from uniforms: the present, travel speed, up to four waves, two focus slots (one extracting, one retracting), the extraction pose, hover, and the passage.
- **Draw order.** Slices are translucent and blended without depth writes, so they are drawn back to front. For parallel planes that order depends only on the camera's position along the time axis, so the instance → slice assignment is re-permuted only when the camera crosses a slice.
- **One texture.** All moments live in one `DataArrayTexture` (1024 px long edge, mipmapped), filled nearest-moment-first. The interpolation between moments happens in the fragment shader, so no blended images are ever generated or stored. Full-resolution textures exist only for the two moments of the focused slice, plus the moments nearest the present once travel settles (decided by `TemporalLOD`).
- **Light.** Output is premultiplied (rgb = emitted light, alpha = absorption) into the composer's half-float buffer, which hundreds of faint layers need to accumulate without banding. Emission adapts to the archive's mean luminance (square-root law), so bright imagery does not burn the block out to white.
- **Cheap fragments.** The fragment shader runs hundreds of times per pixel, so everything that varies slowly across a slice (disclosure, fog, thin film, highlights, bands, caustics, edge weighting) is computed per vertex, and per-slice optics are `flat`. The rim takes its colour from the hue of the slice's own film instead of an extra varying (on tile-based GPUs every varying is re-read per tile). Only the few slices looked at closely (present, hover, extracted) take one branch for full resolution, image dispersion and the focus film. Fully dissolved slices collapse to a point and cost nothing.
- **Quality levels.** `high`: everything. `medium`: no internal bands, caustics or image dispersion. `low`: Fresnel spectral tint only (no wave colour either). `PerformanceMonitor` lowers the pixel ratio first, then the quality, and restores them in the reverse order.

### Performance

Measured in the dev server on an Apple M4 (embedded browser, 1024×768 CSS px viewport) by timing synchronous renders, including post-processing and a forced GPU sync:

| View (lunar-city, 512 slices) | DPR 1 | DPR 1.5 | DPR 1.75 |
| --- | --- | --- | --- |
| Resting (default view) | 5.3 ms | 9.6 ms | 12.5 ms |
| Travelled to the middle | 5.9 ms | 11.0 ms | 14.4 ms |
| Slice drawn out | 5.3 ms | 10.1 ms | 13.0 ms |

- CPU work per frame is about 1.3 ms. The volume is fill-bound: its cost scales with pixels × visible slices. Moving per-fragment work into the vertex shader cut it by ~30%.
- The canvas starts at DPR 1.5 at most, and `PerformanceMonitor` lowers it toward 1 when frames fall short. Expect DPR ≈ 1–1.25 at full screen on a laptop.
- GPU memory: ~2.6 MB per moment in the array (plus mips), at most six full-resolution moment textures, and two sets of depth layers.
- **Phase 3 optics.** Scene pass only (the volume and caustics, no post-processing), rendered into an offscreen 32-bit float target with a forced readback, 1000×700 CSS px, lunar-city at rest. Phase 2: 5.1 ms at DPR 1 and 8.3 ms at DPR 1.5. Phase 3 at `high`: about 5.7 ms and 10.5 ms (+12% and +27%). At rest `medium` and `low` cost about the same as `high`, because the optional terms only run where the medium is disturbed. The first version cost +70–90% before per-fragment work was moved to vertices and varyings were cut.
- Not yet measured: full-screen 60 fps under real `requestAnimationFrame` (the embedded browser used for this work was a hidden pane, so frames were timed synchronously). Check this on the target machine.

## Datasets

The renderer never learns what the moments depict. A dataset looks like this:

```ts
interface TemporalDataset {
  id: string;
  title: string;
  subtitle?: string;
  timeUnit?: "year" | "generic"; // "year": decimal years, labels interpolate as YYYY.MM.DD
  aspect?: number;               // image width / height, and the slices' shape (default 1.6)
  moments: TemporalMomentData[]; // Phase 1's `slices` key is still accepted
}

interface TemporalMomentData {
  id: string;
  time: number;                  // position on the time axis; slice depth is proportional to time
  timeLabel: string;
  title?: string;
  description?: string;
  phase?: string;
  image?: string | string[];     // an array is laid side by side as one picture (e.g. a spread)
  layers?: string[];             // optional far → near depth layers for the Enter view
  attributes?: Record<string, string>;
}
```

Between 6 and ~20 moments works well. Two moments are enough; the sampling and texture array support up to 64, with smaller textures above 24 moments. Images can be anything a browser can draw onto a canvas, and are cropped to cover the dataset's aspect.

### Committed demo: `lunar-city`

Twelve moments of a fictional lunar settlement, 2031–2351 (`src/data/lunar-city/dataset.json`, `public/datasets/lunar-city/`). They are original, procedurally generated artwork from Phase 1. Because the framing is identical in every moment, the volume shows the city being built, emptied, overgrown and buried as one continuous change.

### Local, untracked datasets

For imagery you may use locally but should not commit, for example reference material whose licence is unclear:

```bash
npm run import:images -- path/to/folder --id my-archive --title "My Archive" [--spreads]
```

This copies the images to `public/local/<id>/` and writes `src/data/local/<id>/dataset.json`. Both folders are git-ignored. Local datasets appear automatically in the dev server, and the first one becomes the default there. `?dataset=lunar-city` switches back. **Production builds leave them out** (images and manifests). Build with `VITE_INCLUDE_LOCAL=1` only if you have the right to publish them.

`--spreads` joins a file ending in `-left` with the following one ending in `-right` into one two-page moment. For example, the Death Valley photo-book pages in the reference project (`ui-collections/3d-book-2/public/books/death-valley/`) import as eight moments. That repository's MIT licence covers its code and states no source or licence for those photographs, so they are treated as local-only and are not included here.

## Phase 2 status

| Acceptance criterion | Status |
| --- | --- |
| Corridor no longer the primary structure | Removed; one volume |
| One dense volume of several hundred layers | 512 slices (configurable) |
| Default camera shows the object's thickness | ~38° oblique, slightly above |
| Layers hard to count from the default distance | ~1 px apart; read as striation and glow |
| Subtle collective motion | Travelling waves, breathing, travel compression |
| No longer a photo gallery | No cards, labels, axis or grid |
| Images appear progressively | Mip bias by present / focus / screen spacing |
| Few images → hundreds of layers | 8–12 moments → 512 slices |
| Smooth interpolation between states | Hold + smooth crossfade, on the GPU |
| Scroll moves the temporal focus | The present sections the block |
| Focus separates the slice locally | Rises out; a gap opens and compresses the rest |
| Imagery readable only in focus | Opaque, full resolution only when extracted |
| Enter Slice works | Same passage, adapted to the extracted slice |
| Timeline axis / ticks / labels removed | Yes |
| GPU-efficient rendering | 1 draw call, 1 material, 1 texture array |
| `npm run build` succeeds | Yes |
| Smooth in a desktop browser | See Performance: adaptive DPR; full-screen 60 fps to be confirmed on hardware |

## Phase 3 status

| Acceptance criterion | Status |
| --- | --- |
| No longer ordinary blue transparent glass | Silver-black body with thin-film colour |
| Viewing angle affects spectral colour | Thin-film phase from the refracted path; continuous with camera motion |
| Grazing angles: controlled violet / cyan / gold | Fresnel-gated, cool-biased palette; warm keys brief |
| Default volume mostly neutral | Colour gated by Fresnel, motion and waves |
| Not a generic RGB rainbow | Nonuniform palette, silver at normal incidence |
| Waves carry a spectral pulse | Violet ahead, cyan centre, gold behind; caustics follow |
| Layer density contributes | Film scaled by absorption, accumulates through depth |
| Subtle dispersion at high-contrast edges | Edge fringe; R/B separation on the clearest slices |
| Internal light bands | One wide drifting band, one rare thin gold band |
| Focused slice iridescent before the image resolves | Edge, then a colour front, then the image beneath the film |
| Neighbours react to extraction | Opposite phase shifts on each side, exponential falloff |
| Enter Slice interference boundary | Film, spreading interference, dispersion, viewport field, resolve |
| Images readable during focus | Faint residual film only, after the image resolves |
| Performance | One draw call kept; +12% / +27% scene cost; adaptive quality |
| `npm run build` | Succeeds |
| Interaction and state machine | Unchanged |
| No volume architecture rewrite | Same instancing, material and texture array |

## Roadmap

1. **Real depth inside a moment.** Depth-mapped relief or splat/mesh environments behind the same membrane, so the inside rewards exploration rather than parallax alone.
2. **Better interpolation.** Optical-flow or feature-matched morphing between moments instead of crossfading, so structures move rather than dissolve.
3. **Scale.** KTX2/Basis textures with worker decoding, paging for archives of hundreds of moments, and a half-resolution volume pass (with the extracted slice drawn at full resolution) for large, high-DPR screens.
4. **Authoring.** A dataset loader and authoring workflow for the *Moon Dark Side* material.

Later: sound tied to travel speed and waves, guided paths through the archive, an accessibility review of the 3D interaction, XR.

## References and acknowledgements

Technical study of [HaichaoLihc/create-photo-flipbook-ui](https://github.com/HaichaoLihc/create-photo-flipbook-ui) informed this prototype. **No code or media from it is included**; Temporal Slices is an original implementation.

| Reference | Idea taken |
| --- | --- |
| `stream-implement-3d` (Undertow) | Density as the source of visual impact: thousands of elements perceived as one field, with individual structure revealed by screen-space spacing; brightness normalised by on-screen spacing so dense packing reads as a continuous medium; additive light in a half-float buffer; collective, low-frequency motion; selecting one element from the field and opening it. |
| `3d-book-1` | Pages as deformable surfaces with spring-damped motion (now bending computed per slice in one shader). |
| `3d-book-2` | Cover/contain camera fitting for the Enter passage; capped texture sizes and mipmapping; reduced-motion handling. |
| `photo-ring` | Layout as pure geometry, separate from content. |

Fonts: IBM Plex Mono and IBM Plex Sans (SIL Open Font License), bundled via Fontsource. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

No license has been chosen for this repository yet. Third-party components retain their own licenses (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

# Temporal Slices

**Time is not a timeline. Time is a space.**

Temporal Slices is an experimental WebGL interface for navigating time as a spatial structure.

Each slice represents the state of a world at a different moment. Users can move through time, inspect individual slices, and eventually enter them as immersive environments.

Inspired by the temporal archive concept from *Moon Dark Side* (月球暗面).

---

## Concept

Most interfaces show time as a line: a scrubber, a carousel, a list of dates. Temporal Slices treats it as a place you stand in.

The archive is a field of thin, luminous membranes. Each one is the same world, frozen at a different moment, and they recede along a physical time axis into atmospheric depth. Scrolling does not slide pictures across a screen: the observer travels along that axis, with weight and inertia, and the slices react as you pass. Distant moments are only outlines and faint silhouettes. As you approach one, it resolves into a cold, blurred memory, then into the moment itself. Selecting a slice brings it toward you; entering it carries you *through* its surface into that moment.

Phase 1 asks one question: **can we make someone feel they are standing inside time and physically travelling through it?**

## Screenshots

> Placeholder. Suggested captures for this section:
>
> 1. **Observe**: the field at 2031, slices receding into fog.
> 2. **Travel**: mid-scroll around 2090, membranes bowing with motion.
> 3. **Focus**: 2166.08.08 *First Breach*, neighbours darkened and leaning toward it.
> 4. **Enter**: the frame where the slice covers the screen, just before the membrane.
> 5. **Inside**: the parallax moment of 2221.07.01 *Escaped Gardens*.

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
| `npm run generate:demo` | Regenerate the lunar-city demo imagery and dataset |

## Controls

| Input | Action |
| --- | --- |
| Scroll / trackpad (either axis) | Travel through time: forward = future, back = past |
| `→` `↓` `PageDown` / `←` `↑` `PageUp` | Step one moment forward / back (moves the focus when focused) |
| `Home` / `End` | Travel to the first / last moment |
| Hover | Highlight a slice |
| Click | Focus a slice (travels to it if it is distant) |
| `Space` | Focus the present slice |
| Double-click / `Enter` | Enter the slice |
| `Esc` | Leave the moment, then release focus |
| `L` | Rearrange the same archive into another spatial layout (Axis ↔ Drift) |
| Touch drag | Travel |

When the system asks for reduced motion (`prefers-reduced-motion`), travel becomes near-instant, membranes stop swaying, dust stops drifting, and the passage into a slice becomes a short, direct move.

## The experience

### Four states

```
 OBSERVE ──click──▶ FOCUS ──enter──▶ ENTERING ──▶ INSIDE
    ▲                 │  ▲              │  ▲          │
    └──────esc────────┘  └──── EXITING ◀┘  └───esc────┘
```

- **Observe**: the field. The present (the slice nearest the observer) is fully disclosed; the future recedes into fog; moments already passed dissolve.
- **Focus**: the chosen slice turns toward you, lifts and brightens; the others darken and nearby membranes lean toward it.
- **Entering / Exiting**: one reversible timeline (see below). `Esc` mid-passage simply runs it backward.
- **Inside**: a simple scene for that moment, its image separated into depth layers that move with the pointer.

### Progressive disclosure (LOD)

Detail is a continuous function of distance along the time axis, never a switch:

| Level | Distance | Rendering |
| --- | --- | --- |
| Far | ≳ 6 slices | Luminous film, constant-width edge line, faint silhouette from a heavily blurred thumbnail |
| Mid | ~2–6 slices | Cold monochrome "memory" of the image, blurred via mip bias, scan-line interference |
| Near | ≲ 2 slices | Full-colour image, full-resolution texture faded in, in-world time label |
| Focus | selected | Opaque, brighter, stronger edge, lifted toward the observer, neighbours dimmed |

Textures follow the same principle (`SliceTextureStore`): every slice gets a 384 px texture, loaded outward from the present; full-resolution textures (1600 px) exist only for the few slices near the present or under focus, one is rasterised per frame, and they are released a few seconds after you move on. Depth layers for the Enter view load when a slice is focused.

### Slice deformation

Slices are membranes, not glass panels. All deformation happens in one vertex shader on a shared 48×24 segmented plane, so there is no skeleton per slice:

- **Proximity bow**: the slice at the present bulges slightly as you reach it.
- **Focus attraction**: neighbours of a focused slice lean *toward* it (`| | )) (( | |`), driven by an underdamped spring so they settle with a small tremor.
- **Travel drag**: moving through time bows every membrane against the direction of travel, in proportion to velocity.
- **Ripple**: a concentric disturbance that grows as a slice is entered.

### Enter Slice

One progress value `p ∈ [0, 1]` drives the whole passage (`engine/TemporalTransition.ts`):

1. `0 → 0.3` the rest of the field dims; the slice turns to face you, lifts and grows.
2. `0.05 → 0.56` the camera closes in on a Hermite curve, arriving with speed, until the surface exactly **covers** the viewport; distortion rises.
3. At `0.56` the scene changes space. The moment's camera sees a *membrane* (the same surface, mirroring the focused slice's uniforms) at a distance chosen so that it projects identically, so the swap is invisible.
4. `0.56 → 1` the camera continues through the membrane (it ripples, flares and opens) into the moment, where the image's depth layers stand at 3.6–16 units and drift with the pointer.

Exiting runs the same curves backward. The camera's starting pose is captured when the passage begins, so both directions are continuous.

## Architecture

```
Temporal Engine (pure TypeScript)      ← no Three.js, no React, unit-tested
        ↓
Temporal Dataset (JSON + images)       ← any world: a city, a person, an experiment
        ↓
Visual Experience (React Three Fiber)  ← reads engine values each frame
```

```
src/
├── app/
│   ├── App.tsx                  creates the runtime for the chosen dataset, wires input
│   └── styles.css
├── engine/                      ← knows nothing about rendering or content
│   ├── types.ts                 TemporalSliceData, TemporalDataset
│   ├── TemporalDataset.ts       validation, time interpolation, labels, phases
│   ├── TemporalLayout.ts        TemporalLayout: where each moment exists in space
│   ├── TemporalNavigation.ts    inertial travel along the time axis
│   ├── TemporalLOD.ts           continuous far / mid / near disclosure
│   ├── TemporalFocus.ts         how a slice presents itself to the observer
│   ├── TemporalState.ts         interaction state machine + tiny store
│   ├── TemporalTransition.ts    the Enter Slice timeline and camera path
│   └── math.ts                  springs, easing, vectors
├── scene/                       ← Three.js / R3F; knows nothing about lunar cities
│   ├── runtime.ts               per-frame shared state + React context
│   ├── TemporalScene.tsx        Canvas composition, adaptive DPR
│   ├── TemporalDirector.tsx     advances navigation, transition, streaming
│   ├── TemporalCamera.tsx       observer: browse pose, focus, passage, inside
│   ├── TemporalField.tsx        all slices on one shared geometry
│   ├── TemporalSlice.tsx        one slice: engine values → uniforms, reflection, label
│   ├── TemporalEnvironment.tsx  floor grid, time axis and ticks, dust
│   ├── TemporalMoment.tsx       the inside of a slice: membrane + depth layers
│   ├── TemporalEffects.tsx      bloom, chromatic separation, tone mapping, grain
│   ├── SliceTextureStore.ts     progressive texture loading and release
│   ├── sliceMaterial.ts         shared slice ShaderMaterial factory
│   ├── Dust.tsx, labelTexture.ts, constants.ts
├── shaders/                     slice, floor and dust GLSL
├── ui/
│   ├── TemporalHUD.tsx          date odometer, phase, ruler, hints, intro card
│   └── useTemporalInput.ts      wheel, keys, touch → engine events
└── data/
    ├── index.ts                 dataset registry
    └── lunar-city/temporal-slices.json
scripts/generate-lunar-city.mjs  procedural demo content
public/datasets/lunar-city/      generated SVG imagery (composite + 3 depth layers per slice)
tests/                           Vitest: engine behaviour and dataset integrity
```

**Data flow.** Discrete interaction state (mode, focus, hover, layout) lives in a small observable store; only the HUD re-renders from it. Continuous values (travel position, transition progress, animated placements, springs) live in a per-frame `runtime` object read inside `useFrame`, so the 3D field never re-renders React. Frame order is explicit: director (`-3`) → camera (`-2`) → slices → effects.

**Rendering.** Every slice uses the same `ShaderMaterial` program and the same geometry; each carries only its own uniforms. Output is premultiplied so edges can glow without occluding. Reflections are the same mesh mirrored below the floor; the shader fades anything below the floor plane, so no extra render pass is needed. Fog is computed per fragment so distant slices fade to the background rather than to grey.

**Layouts.** A layout is a path through space parameterised by slice index; slices stand on the path facing the past, and the observer is defined in the path's frame. `corridor` is a straight axis; `drift` meanders like a river. The present position is preserved when switching, and slices morph between placements (press `L`).

## Using your own temporal data

The renderer never learns what the slices depict. To replace the demo, provide a dataset of this shape and register it in `src/data/index.ts` (or open the app with `?dataset=<id>`):

```ts
interface TemporalDataset {
  id: string;
  title: string;
  subtitle?: string;
  timeUnit?: "year" | "generic"; // "year": decimal years, labels interpolate as YYYY.MM.DD
  aspect?: number;               // image width / height (default 1.6)
  slices: TemporalSliceData[];
}

interface TemporalSliceData {
  id: string;
  time: number;                  // position on the time axis; slices are sorted by it
  timeLabel: string;             // e.g. "2174.06.12"
  title?: string;
  description?: string;
  phase?: string;                // era or chapter; drives the HUD ruler segments
  image?: string;                // path relative to the app base, or absolute URL
  thumbnail?: string;            // optional pre-reduced image for distant slices
  layers?: string[];             // optional far → near depth layers for the Enter view
  attributes?: Record<string, string>; // environmental readings shown on focus
}
```

Images can be any format the browser can draw onto a canvas (SVG, PNG, JPEG, WebP, AVIF). Without `layers`, the Enter view uses the single image.

## The demo archive

`scripts/generate-lunar-city.mjs` draws one fictional settlement in the Mare Serenitatis at 40 moments from 2031 to 2351: foundation, expansion, peak, decline, abandonment, damage, escaped greenhouse growth, collapse, ruins, and near-erasure under regolith. Every structure is defined once with its own seed, build year and collapse year, so the same domes, towers, windows and glass panels persist from slice to slice and age consistently. Earth hangs in the same place throughout, as a witness. All imagery is original and generated; no external photographs or media are used.

## Performance

- 40 slices = 80 draw calls (slice + reflection) plus labels, on one program and one geometry.
- Measured in the dev server on this Mac (Apple silicon, embedded browser, 800×520 CSS px viewport at DPR 1.75): steady 60 fps while travelling through the entire archive in five seconds, worst frame ≈ 19 ms (when a full-resolution texture is rasterised). Full-screen measurements on other hardware are still to be done.
- GPU memory: ~20 MB of thumbnails, ≤ 9 full-resolution slice textures, 2 sets of moment layers.
- `PerformanceMonitor` lowers the pixel ratio (1.75 → 1) when frames fall short.

## References and acknowledgements

Technical study of [HaichaoLihc/create-photo-flipbook-ui](https://github.com/HaichaoLihc/create-photo-flipbook-ui) informed this prototype. **No code or media from it is included**; Temporal Slices is an original implementation. What was borrowed, conceptually:

| Reference | Idea taken | How it became Temporal Slices |
| --- | --- | --- |
| `3d-book-1` (React Three Fiber) | Pages as segmented, deformable surfaces with spring-damped motion; R3F scene structure; parking animation when settled | *Page → temporal slice.* Bending moved from a 21-bone `SkinnedMesh` per page into one vertex shader on shared segmented geometry, which scales to dozens of slices. Its page-curl code is adapted from a third-party project, so it was deliberately not reused. |
| `3d-book-2` (Three.js + Quick FlipBook) | Hover preview, click and drag affordances, camera fitting to content, texture size limits and mipmapping, reduced-motion handling | Cover/contain camera fitting for the Enter passage; capped texture sizes; hover lift and edge emphasis. Quick FlipBook (BSD-2-Clause) is not used. |
| `photo-ring` | Layout as pure geometry separate from content; one dataset, several arrangements; position preserved when switching | `TemporalLayout`: path-based layouts that keep the present position; slices morph between placements. |
| `stream-implement-3d` (Undertow) | A huge abstract field; detail revealed by screen proximity; light treatment (bloom, vignette, grain); selecting one element from a field and opening it into a story | Continuous LOD (outline → silhouette → blurred memory → image), progressive texture streaming, restrained bloom and grain, and the slice-to-moment passage. |

Fonts: IBM Plex Mono and IBM Plex Sans (SIL Open Font License), bundled via Fontsource. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Roadmap

**Phase 1 (this prototype)**: temporal field, inertial travel, continuous LOD, membrane deformation, focus, the reversible Enter Slice passage, a procedural demo archive.

**Phase 2: highest-value next steps**

1. **Real depth inside a moment.** Replace stacked image layers with a genuinely spatial scene per slice (depth-mapped relief or Gaussian-splat / mesh environments), still opened through the same membrane passage, so the "inside" rewards exploration rather than parallax alone.
2. **Temporal continuity between slices.** Interpolate *between* moments while travelling (cross-dissolve or flow-based morphing on the near slices, and matching structures across slices) so the world visibly ages and rebuilds in motion, not only in steps.
3. **Scalable archive engine.** Texture arrays / instanced slices, worker-side image decoding (KTX2 / Basis), and time-proportional or hierarchical layouts (years → decades → eras with semantic zoom), so archives of hundreds or thousands of moments stay fast and legible; plus a dataset loader and authoring workflow for the *Moon Dark Side* material.

Later: sound design tied to travel speed and era, guided narrative paths through the archive, accessibility review of the 3D interaction model, and XR.

## License

No license has been chosen for this repository yet. Third-party components retain their own licenses (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

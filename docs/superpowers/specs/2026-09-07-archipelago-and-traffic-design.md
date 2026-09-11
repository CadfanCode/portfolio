# Stockholm Archipelago and Boat Traffic — Design

Date: 2026-09-07
Status: approved, awaiting implementation plan

## Goal

Replace the empty sea around the Maxi 77 with a Stockholm archipelago — granite
skerries, Scots pine, Falu-red houses — and populate the water with other vessels
that come and go.

Two subsystems, one spec, because they share the same machinery: placement in
`worldFrame`, the fog and lighting model, the quality tiers, and the far-water
plane that both depend on.

The blog whiteboard from the same request is **out of scope here** and gets its
own spec.

## Constraints established from the existing code

These are measured, not assumed. They shape every decision below.

| Fact | Source |
| --- | --- |
| Sea is a flat 400x400 plane centred on the boat: water stops at +/-200 m on axis, 282.8 m at the corners | `src/scene/Ocean.tsx:391` |
| Fog is `FogExp2`, density 0.0016 (clear) to ~0.0566 (fog preset), colour from `sampleConditions().fog` | `src/scene/PortfolioWorld.tsx:230`, `src/scene/conditions.ts:167` |
| Ocean's custom shader re-implements the identical fog term, `1 - exp(-(d*density)^2)`, because custom materials get no automatic fog | `src/scene/Ocean.tsx:393` |
| Sky dome is `scale 300`, `BackSide`, `depthWrite={false}`, `renderOrder={-1}` — it does **not** occlude, so geometry beyond 300 m renders fine | `src/scene/Weather.tsx:88-94` |
| Camera has no explicit `far`, so R3F's default 2000 m applies. FOV 50 | `src/SceneCanvas.tsx:35` |
| `worldFrame` holds Sky, lights, Weather, Ocean and rotates to fake the boat's motion; `boatFrame` counter-rotates | `src/scene/PortfolioWorld.tsx:99-116` |
| Bow is toward -Z, Y is up, world origin is the boat's waterline | `src/scene/Boat.tsx` (model transform comment) |
| All three camera stops allow **full 360 degree azimuth** | `src/scene/cameraStops.ts:92-98, 122-129, 154-158` |
| Ocean stop orbits at only ~14 m radius, polar clamped 25-88 deg | `src/scene/cameraStops.ts:47-50, 75-98` |
| Wind bearing is a single constant `WIND_DEG = 18` | `src/scene/wind.ts:26` |
| `sampleHeight(x, z, time, ampScale)` already takes a world position | `src/scene/water/waves.ts:132` |
| Quality tiers are fixed at import; convention is "one line in each of the three tiers and one line in the consumer" | `src/scene/quality.ts:11-14` |
| No instancing, no LOD helper, no draco, no meshopt anywhere in the repo | scout sweep of `src/`, `vite.config.ts` |
| Established procedural-texture idiom: offscreen canvas -> `CanvasTexture` -> sRGB -> clamp anisotropy -> dispose | `src/scene/CabinPictures.tsx:184-261`, `BookSpines.tsx:240-275` |
| CC-BY attribution precedent already exists for a poly.pizza asset | `ATTRIBUTION.md` (parrot) |

## Approved art direction

Layered depth, which is what makes archipelago photographs read:

```
TOP-DOWN  (bow = -Z = up, ~1 char : 20 m)

     . . . . far island band  550-1300 m . . . .
        ...^^^...        ...^^^^...

                         ^^^^^^ [house]
         ^^              ^^^^^^^^^  mid island ~178 m
        ^^^^             ^^^^^^   pines + red house + jetty
      near skerry ~72 m
      bare granite
                  (boat)

            open water astern
```

Inner archipelago is forested and inhabited; outer skerries are bare wind-swept
granite. Rock is glacially polished — rounded whalebacks, no peaks. Houses are
Falu red (~`#7B3B2E`) with white trim. Pines are stunted and gnarled on exposed
rock, fuller inland.

## A. Far-water skirt (`src/scene/water/OceanFar.tsx`)

The enabler. Land beyond 200 m would otherwise float over nothing.

**Geometry.** A `ringGeometry`, inner radius **190 m**, outer radius **1600 m**,
96 radial segments, 8 rings graded so density concentrates at the inner edge.
Roughly 1.5k triangles.

Inner radius 190 is deliberate: every point at radius 190 satisfies
`|x| <= 190 <= 200` and `|z| <= 190 <= 200`, so the ring's inner edge is
**always** covered by the square ocean plane, in every direction, with no gap.
An inner radius above 200 would leave a visible wedge of missing water along the
axes, since the square only reaches 200 m on axis but 282.8 m at the corners.

**Placement.** `y = -0.25`, inside `worldFrame`, rendered immediately after
`<Ocean/>`. The 0.25 m drop guarantees the square wins the depth test wherever
both exist, so there is no z-fighting. At 200 m the step subtends under 0.1
degrees from any camera stop, and both surfaces resolve to the same fogged
colour there, so it is not visible.

**Shading.** A `ShaderMaterial` reusing Ocean's `skyColor()` gradient and the
**identical** fog term `1 - exp(-(uFogDensity * dist)^2)` mixed toward
`uFogColor`, both uniforms driven from `sampleConditions(t)` exactly as
`Ocean.tsx:514-515` does. Flat `(0,1,0)` normals, no Gerstner displacement. One
very-low-frequency normal perturbation so it is not a mirror.

This is an improvement in its own right: today the horizon is a fogged plane
edge.

## B. Archipelago (`src/scene/archipelago/`)

### Placement is authored, not random

Islands live in `layout.ts` as explicit data. A visitor should see the same
coastline on every visit — the land is the setting, not a slot machine.
Randomness belongs to traffic and to prop scatter (seeded, therefore stable).

Each entry: `{ id, tier, centre: [x, z], a, b, rotation, height, seed, props }`.

| id | tier | centre [x,z] | a x b | height | distance | props |
| --- | --- | --- | --- | --- | --- | --- |
| `skerry-near` | near | [-62, -38] | 26 x 17 | 4.2 m | ~72 m | sea mark only; bare granite |
| `island-mid` | mid | [95, -150] | 70 x 44 | 13 m | ~178 m | pines, red house, jetty, flagpole |
| `skerry-port` | mid | [-140, 90] | 30 x 22 | 5.5 m | ~166 m | a few stunted pines |
| far band | far | r 550-1300 | 120-320 | 18-30 m | — | none |

The far band is 6-9 islands spread across the forward ~200 degrees with a
deliberate gap astern, preserving the open-water-astern read.

### Landmass geometry (`island.ts`)

A pure function: island definition in, `BufferGeometry` out. No React, no
three.js scene graph — testable in isolation.

Elliptical footprint sampled on a grid in local `(u,v)` in `[-1,1]^2`:

```
r      = length(u, v)
mask   = smoothstep(1.0, 0.55, r)          // shoreline exactly at r = 1
height = H * mask^1.4
       * (0.65 + 0.35 * noise(u*2.5, v*2.5, seed))    // low freq: whalebacks
       + H * 0.12 * noise(u*9.0, v*9.0, seed+1)       // surface break-up
```

Low-frequency noise is the whole trick — it is what produces smooth rounded
granite rather than the spiky terrain that high-frequency noise gives.

Below the shoreline the mesh continues to `r = 1.15` dropping to `y = -1.5`, so
no gap can ever show between rock and water regardless of wave state.

Grid resolution comes from the quality tier (see D). At `high`: near 96x96
(~18k tris), mid 64x64 (~8k), far 32x32 (~2k each).

`noise.ts` provides seeded value noise and a seeded RNG. Same seed, same island,
every load, every machine.

### Granite material (`granite.ts`)

`meshStandardMaterial` with a procedural `CanvasTexture` built with the repo's
established idiom (`CabinPictures.tsx:184-261`): draw offscreen, set
`SRGBColorSpace`, clamp anisotropy to
`Math.min(tierAnisotropy, gl.capabilities.getMaxAnisotropy())`, dispose on
unmount.

Pink-grey mottle, high roughness. Two vertex-driven bands on top: a darker wet
zone within ~0.8 m of the waterline, and a lichen tint above ~60% height. Both
as vertex colours computed in `island.ts`, not as extra texture lookups.

### Props (`props.tsx`)

`InstancedMesh` per kit part — the first instancing in this codebase.

- **Pines**: rejection-sampled where `height > 0.35 * H` and slope < 0.6, with a
  minimum spacing of 3.5 m, scale jitter 0.75-1.35, random Y rotation. Capped at
  ~180 on `island-mid`, ~20 stunted on `skerry-port`, **zero** on `skerry-near`
  — bare granite is the point of that one.
- **House, boathouse, jetty, flagpole, sea mark**: hand-placed per island in
  `layout.ts` and snapped to the heightfield. A landmark is authored, not
  scattered.

### Blender kit (`blender/archipelago.py` -> `archipelago-kit.glb`)

Parts: `pine_a`, `pine_b`, `pine_stunted`, `house_red`, `boathouse_red`,
`jetty`, `sea_mark`, `flagpole`. Built parametrically in the existing pipeline
style. Budget **under 200 KB uncompressed** for the whole kit, because there is
no draco or meshopt in this project and every byte ships raw.

`build.py` gains a target selector so it can emit either the boat or the kit;
`params.py` gains the kit dimensions. This is the only change to the Blender
pipeline.

## C. Traffic (`src/scene/traffic/`)

### Roster (`fleet.ts`)

| class | weight | lane | speed |
| --- | --- | --- | --- |
| sailboat A | 35% | near | 2.5-4 m/s |
| sailboat B | 25% | near | 2.5-4 m/s |
| archipelago steamer | 20% | mid | 5 m/s |
| tug | 15% | mid | 4 m/s |
| Baltic ferry | 5% | far | 7 m/s |

Models are poly.pizza GLBs in `src/assets/models/traffic/`. All five are
verified as downloading, and all five are **CC-BY 3.0**, so every one needs an
`ATTRIBUTION.md` entry in the same form as the existing parrot entry.

| role | title | publicID | ResourceID | tris | GLB |
| --- | --- | --- | --- | --- | --- |
| sailboat A | Sailboat | `7AOnch2wREC` | `0539464a-5deb-43b0-9a1d-dab0dbd55436` | 805 | 17.8 KB |
| sailboat B | Sailboat | `5u49Hzbo5WH` | `484354dd-3c19-42b3-8bf4-399b66e12c39` | 676 | 40.1 KB |
| tug | Tugboat | `eEbXA8_6MeJ` | `3bf3b70c-6e61-4a18-aff0-0d7c6eef69ac` | 528 | 82.9 KB |
| steamer | Cruise liner | `aOikPp4rz68` | `d51c2fe4-6d94-4f83-bd5c-bb99e1bd926e` | 1044 | 51.0 KB |
| ferry | Cruise liner | `cPiY_8RZMHE` | `f49539e8-cda3-4913-9a4b-774047f06dca` | 2482 | 65.6 KB |

Download URL is `https://static.poly.pizza/<ResourceID>.glb`. Creators are
"Poly by Google" (A, tug, ferry) and "jeremy" (B, steamer). Total 251 KB.

Rejected during sourcing, recorded so nobody re-treads it: an alternate TugBoat
at 11,574 tris; the obvious "Cruise ship" `dgLCxDWhnZQ`, which is only 4,758
tris but ships a **3.8 MB** GLB because of embedded textures; and a model
titled "Steamer" (`jEiEvfgMkj`) which is not a boat at all but a wooden barrel,
tagged `Box` in category `Objects`.

**Scale is not trusted.** None of these models has a verified real-world scale
or up-axis. Each is normalised at load: measure the GLB's bounding box, scale
so its length matches an authored `lengthM` in `fleet.ts` (sailboat ~8 m, tug
~20 m, steamer ~30 m, ferry ~160 m), and orient so the bow points along -Z to
match the project's convention. A `traffic/normalise.ts` helper does this once
per model, memoised.

### Lanes (`rails.ts`)

A lane is a straight line: `{ id, bearingDeg, offsetM, halfLength, speedRange,
maxConcurrent }`. `bearingDeg` is the lane's compass heading in world XZ, with
0 degrees along -Z (the bow direction). `offsetM` is the lane's perpendicular
distance from the world origin, i.e. how far abeam of the boat it passes; its
sign picks which side. `halfLength` bounds the lane symmetrically about its
closest point to the origin, so a vessel's transit time is
`2 * halfLength / speed`. Vessels traverse in either direction, chosen per
spawn.

| lane | bearing | offset | half-length |
| --- | --- | --- | --- |
| near | 105 deg | 160 m | 300 m |
| mid | 20 deg | 320 m | 600 m |
| far | 75 deg | 850 m | 1200 m |

### Spawn scheduler (`useTraffic.ts`)

A Poisson process per lane. "Sometimes none, sometimes one, sometimes several"
is the natural output of a low-rate Poisson process — no special-casing.

Expected concurrent occupancy is `lambda * T`, where `T` is transit time. Tuning
for `lambda*T ~= 1.0` gives P(0 boats) = 37%, P(1) = 37%, P(2) = 18%, P(3+) = 8%
on the near lane. That is exactly the requested distribution.

**Critical detail: the lanes are seeded at t = 0** with a random initial
occupancy drawn from the same stationary distribution, with each vessel placed
at a random point along its lane. Without this, every visitor's first view is an
empty sea and boats only trickle in after minutes — which, for a visit that may
last ninety seconds, would mean the feature is almost never seen. Seeding is
what actually delivers the requested behaviour.

Near lane: `T ~= 200 s`, so mean inter-arrival ~200 s, cap 3 concurrent.

### Rendering (`Traffic.tsx`, `Wake.tsx`)

Each vessel sits in `worldFrame` so it rocks with the horizon. Motion comes from
the existing wave field, with **no changes to `waves.ts`**:

- heave: `sampleHeight(x, z, t, ampScale)`
- pitch and roll: finite differences of `sampleHeight` about the vessel's
  position, scaled by its length and beam
- sailboats additionally take `heelAngle()` from `wind.ts`, and their heading is
  biased relative to `WIND_DIR` so they are not sailing straight into the wind

Wake is a stretched additive plane, fading with distance, off entirely at the
`low` tier.

**Traffic is not interactive** — no pointer handlers. A click in this scene
means "this is an exhibit", and diluting that would cost more than the vessels
gain. (Confirmed with the owner.)

Vessels despawn past the lane end or once fog opacity exceeds ~95%.

## D. Quality tiers

Two new knob groups in `quality.ts`, one line in each of the three tiers per
that file's stated convention:

```ts
archipelago: {
  islandSegments: { near: number, mid: number, far: number },
  pineDensity: number,   // multiplier on scatter counts
  farIslands: number,    // how many of the far band to build
},
traffic: {
  maxConcurrent: { near: number, mid: number, far: number },
  wakes: boolean,
},
```

| tier | islandSegments | pineDensity | farIslands | maxConcurrent | wakes |
| --- | --- | --- | --- | --- | --- |
| low | 48 / 32 / 16 | 0.35 | 4 | 1 / 1 / 0 | false |
| medium | 72 / 48 / 24 | 0.70 | 6 | 2 / 1 / 1 | true |
| high | 96 / 64 / 32 | 1.00 | 9 | 3 / 2 / 1 | true |

## Files

New:

```
src/scene/water/OceanFar.tsx
src/scene/archipelago/{layout,island,noise,granite}.ts
src/scene/archipelago/{props,Archipelago}.tsx
src/scene/traffic/{fleet,rails,useTraffic}.ts
src/scene/traffic/{Traffic,Wake}.tsx
src/assets/models/archipelago-kit.glb
src/assets/models/traffic/*.glb
blender/archipelago.py
```

Edited:

```
src/scene/PortfolioWorld.tsx   mount OceanFar, Archipelago, Traffic in worldFrame
src/scene/quality.ts           two knob groups x three tiers
blender/build.py               target selector
blender/params.py              kit dimensions
ATTRIBUTION.md                 poly.pizza entries
CLAUDE.md                      folder conventions, current focus
```

## Implementation phasing

The plan should land this in four independently verifiable phases, in this
order, because each one is only checkable once the previous exists:

1. **Far-water skirt alone.** No land, no traffic. The seam either reads or it
   does not, and that verdict must not be confounded by anything else on screen.
2. **Landmass geometry.** `noise.ts`, `island.ts`, `layout.ts`,
   `Archipelago.tsx`, granite material. Bare rock, no props. Verifies shape,
   scale, placement and the shoreline join.
3. **Blender kit and prop scatter.** Pines, houses, jetty, sea mark, instancing.
4. **Traffic.** Fleet, rails, scheduler, wakes.

Phase 1 is a standalone improvement and could ship on its own. Phases 2-4 are
each meaningful on their own too, so a stall in any of them still leaves the
scene in a better state than it started.

## Risks

1. **The water seam at 190 m.** Mitigated by the inner-radius argument above and
   the 0.25 m drop, but it is the thing most likely to look wrong, so it ships
   and gets verified first, before any land exists.
2. **The ocean stop orbits at ~14 m with full 360 degree azimuth**, so the 72 m
   skerry swings right past the camera. It must read from every bearing, not
   just a chosen one.
3. **The intro flight** (`IntroClouds`, `IntroTitle`, `introFlight.ts`) may now
   pass near or through land. Needs checking; the flight path may need nudging.
4. **Fog presets hide everything.** At density 0.0566 visibility falls under
   ~60 m and all land vanishes. Treated as a feature — land emerging as weather
   clears — but it does mean the archipelago is absent for part of the cycle.
5. **Instanced pine count.** ~180 instances is nothing, but the scatter solve
   runs over the heightfield; it must be memoised, not recomputed per frame.
6. **Blender pipeline gains a second target.** Small, but it is the first time
   `build.py` emits more than one artefact.

## Verification

- `npx tsc -b`, `npm run lint`, `npm run build`
- `npm run model:verify` for the kit
- **Scheduler statistics.** `useTraffic`'s scheduler is a pure function and is
  tested as one: simulate 10,000 s, assert P(0 vessels on the near lane) falls
  in [0.25, 0.55], assert the concurrent cap is never exceeded, assert seeding
  at t=0 produces a non-degenerate spread of initial occupancies.
- **Runtime scene checks.** Screenshots time out in this project, so verify by
  importing the store and R3F `_roots` from the dev server: assert island meshes
  exist with the expected tier resolutions, count instanced props, sample
  traffic occupancy over simulated time.
- A `checker` pass over the working diff before merge.

## Out of scope

The blog whiteboard. It is an interior exhibit built on the `CabinPictures`
plane-plus-`CanvasTexture` pattern with live Blogger data, and it shares nothing
with this work. Separate spec.

Two findings recorded for that spec while researching this one:

- The blog at `caibirch.blogspot.com` currently has **zero published posts**
  (`openSearch$totalResults: 0`), so the empty state is the default state and
  has to be designed properly rather than treated as an edge case.
- The Blogger feed sends **no CORS header**, so a plain browser `fetch` is
  blocked. `?alt=json-in-script&callback=` (JSONP) works and is verified.

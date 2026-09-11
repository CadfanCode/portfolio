# Archipelago and Boat Traffic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surround the Maxi 77 with a Stockholm archipelago and populate the water with vessels that randomly come and go.

**Architecture:** A far-water ring extends the sea past the existing 400x400 plane so land has something to sit on. Islands are seeded-noise heightfields built by a pure geometry function and placed from authored data. Props (pine, red house, jetty) come from one Blender-authored GLB kit, scattered with `InstancedMesh`. Traffic is a pure Poisson scheduler driving GLB vessels along straight lanes, riding the existing wave field.

**Tech Stack:** Vite, React 19, TypeScript, three.js 0.185, @react-three/fiber 9, @react-three/drei 10, zustand 5, Oxlint, Blender (flatpak), Vitest (added by Task 0).

**Spec:** `docs/superpowers/specs/2026-09-07-archipelago-and-traffic-design.md`

## Global Constraints

- **Coordinate convention:** bow is `-Z`, `Y` is up, world origin is the boat's waterline. Every position in this plan is in those world units (metres).
- **Everything outdoor mounts inside `worldFrame`** in `src/scene/PortfolioWorld.tsx`, never `boatFrame`. `worldFrame` rotates to fake the boat's motion; land and traffic must rock with the horizon.
- **Fog term is fixed and must be copied exactly:** `fog = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist))`, then `mix(color, uFogColor, clamp(fog, 0.0, 1.0))`. Uniforms are driven per-frame from `sampleConditions(t).fogDensity` and `.fog`, exactly as `src/scene/Ocean.tsx:514-515` does. Custom `ShaderMaterial` gets no automatic three.js fog.
- **The sea plane is 400x400** (`src/scene/Ocean.tsx:391`): water exists only for `|x| <= 200 && |z| <= 200`.
- **No draco, no meshopt.** Every GLB byte ships raw. Blender kit budget: under 200 KB.
- **Quality knobs:** adding one is "one line in each of the three tiers and one line in the consumer" (`src/scene/quality.ts:11-14`). Tiers are resolved once at import and never change at runtime.
- **Procedural texture idiom** (`src/scene/CabinPictures.tsx:184-261`): draw to an offscreen canvas, wrap in `CanvasTexture`, set `colorSpace = SRGBColorSpace`, clamp anisotropy to `Math.min(tierAnisotropy, gl.capabilities.getMaxAnisotropy())`, dispose on unmount or deps change.
- **Seeded randomness only.** Islands and prop scatter must be byte-identical across loads and machines. Only traffic timing is live-random.
- **Named exports only.** The codebase is 56:1 named-to-default (`src/App.tsx` is the sole default). Every interface block below is written with named exports; keep it that way.
- **Commands:** `npx tsc -b` typecheck, `npm run lint`, `npm run build`, `npx vitest run` tests, `npm run model:build` / `model:verify` Blender.
- **Screenshots time out in this project.** Verify the running scene by importing the store and R3F `_roots` from the dev server, never by screenshotting.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/scene/archipelago/noise.ts` | Seeded RNG and value noise. Pure, no three.js. |
| `src/scene/archipelago/island.ts` | Heightfield -> `BufferGeometry` plus height/slope queries. Pure. |
| `src/scene/archipelago/layout.ts` | Authored island placements and authored prop placements. Data only. |
| `src/scene/archipelago/granite.ts` | Procedural granite `CanvasTexture` and material. |
| `src/scene/archipelago/Archipelago.tsx` | Mounts island meshes, memoised per quality tier. |
| `src/scene/archipelago/props.tsx` | `InstancedMesh` scatter of kit parts onto islands. |
| `src/scene/archipelago/scatter.ts` | Pure prop-placement solver. No three.js. |
| `src/scene/water/OceanFar.tsx` | Flat far-water ring, 190 m to 1600 m. |
| `src/scene/traffic/fleet.ts` | Vessel class table. Data only. |
| `src/scene/traffic/rails.ts` | Lane definitions and lane geometry maths. Pure. |
| `src/scene/traffic/scheduler.ts` | Poisson spawn/despawn state machine. Pure, no three.js, no React. |
| `src/scene/traffic/normalise.ts` | GLB bounding-box measure and scale/orient normalisation. |
| `src/scene/traffic/useTraffic.ts` | React hook wiring `scheduler` to frame time. |
| `src/scene/traffic/Traffic.tsx` | Renders active vessels, applies wave motion. |
| `src/scene/traffic/Wake.tsx` | Additive wake plane behind a vessel. |
| `blender/archipelago.py` | Parametric prop kit build. |

**Modified:**

| File | Change |
| --- | --- |
| `src/scene/PortfolioWorld.tsx` | Mount `OceanFar`, `Archipelago`, `Traffic` inside `worldFrame`. |
| `src/scene/quality.ts` | Two new knob groups across three tiers. |
| `blender/build.py` | Target selector so it can emit the kit as well as the boat. |
| `blender/params.py` | Kit dimensions. |
| `package.json` | Vitest dev dependency and `test` script. |
| `ATTRIBUTION.md` | Five CC-BY 3.0 poly.pizza vessel entries. |
| `CLAUDE.md` | Folder conventions and current focus. |

---

## Task 0: Test harness

Pure modules in this plan (`noise`, `island`, `scatter`, `rails`, `scheduler`) carry real logic that is cheap to test and expensive to debug through a 3D scene. The repo has no test runner at all, so one is added here.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/scene/archipelago/noise.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npx vitest run` works; `npm test` is an alias.

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest@^3
```

- [ ] **Step 2: Add the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

// Node environment only. Every module under test here is deliberately free of
// three.js scene-graph and React, so no jsdom or WebGL context is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add the script**

In `package.json` `scripts`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Prove the runner works with a throwaway test**

Create `src/scene/archipelago/noise.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `npx vitest run`
Expected: 1 passed.

- [ ] **Step 6: Confirm tests are excluded from the production build**

Run: `npx tsc -b && npm run build`
Expected: both succeed. If `tsc` pulls `*.test.ts` into the app build, add `"exclude": ["src/**/*.test.ts"]` to `tsconfig.app.json` and re-run.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/scene/archipelago/noise.test.ts tsconfig.app.json
git commit -m "test: add vitest for pure scene modules"
```

---

## Phase 1 — Far-water skirt

Ships and is verified before any land exists, so the seam verdict is not confounded by other new geometry.

## Task 1: The far-water ring

**Files:**
- Create: `src/scene/water/OceanFar.tsx`
- Modify: `src/scene/PortfolioWorld.tsx`

**Interfaces:**
- Consumes: `sampleConditions` from `src/scene/conditions.ts`; the `skyColor()` GLSL function and fog term from `src/scene/Ocean.tsx`.
- Produces: `export function OceanFar(): JSX.Element` — a mesh mounted in `worldFrame`.

**Why inner radius 190, not 200 or 285.** Every point at radius 190 satisfies `|x| <= 190 <= 200` and `|z| <= 190 <= 200`, so the ring's inner edge is covered by the square ocean plane in *every* direction. The square reaches 200 m on axis but 282.8 m at the corners, so an inner radius anywhere above 200 leaves a wedge of missing water along the axes. Do not "tidy" this number upward.

- [ ] **Step 1: Read the reference implementation**

Read `src/scene/Ocean.tsx`, specifically: the `skyColor()` GLSL function (around lines 236-247), the fog lines (393-394), and the per-frame uniform update (505-520). The new material copies the fog term and sky gradient verbatim.

- [ ] **Step 2: Write the component**

Create `src/scene/water/OceanFar.tsx`. Requirements, all of which must hold:

- `<ringGeometry args={[190, 1600, 96, 8]} />`, rotated `-Math.PI / 2` about X so it lies in XZ.
- `position={[0, -0.25, 0]}`. The drop guarantees the square ocean wins the depth test wherever both exist, so there is no z-fighting; at 200 m a 0.25 m step subtends under 0.1 degrees and is invisible.
- A `ShaderMaterial` with uniforms `uTime`, `uFogDensity`, `uFogColor`, `uOvercast`, `uSunDir`, `uWindDir`.
- Fragment shader: the same `skyColor()` gradient as `Ocean.tsx`, a Fresnel term against a flat `(0,1,0)` normal perturbed by one very-low-frequency ripple (amplitude small enough that it never reads as waves, just breaks the mirror), then the fog term copied exactly per Global Constraints.
- No vertex displacement. This surface is flat.
- `frustumCulled={false}` — it is larger than the shadow camera and must never pop.
- A `useFrame` that copies `sampleConditions(t)` into the uniforms, mirroring `Ocean.tsx:505-520`.

- [ ] **Step 3: Mount it**

In `src/scene/PortfolioWorld.tsx`, inside the `worldFrame` group, immediately after `<Ocean />`:

```tsx
<OceanFar />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both clean.

- [ ] **Step 5: Verify in the running scene**

Start `npm run dev`. Screenshots time out in this project, so verify through the dev server by importing the R3F roots and asserting the mesh exists with the expected geometry parameters, and that its material uniforms track `sampleConditions` as weather drifts.

Check specifically, by eye in a browser at the `ocean` camera stop, orbiting a full 360 degrees:
- No visible seam or colour step at ~190-200 m in any direction.
- No z-fighting shimmer along the join when the camera moves.
- The horizon reads as sea meeting sky, not as a plane edge dissolving into fog.
- Cycle the weather with `?cond=fair-breeze`, `?cond=fog` and `?cond=squall` and confirm the ring's fog matches the main plane's at each.

- [ ] **Step 6: Commit**

```bash
git add src/scene/water/OceanFar.tsx src/scene/PortfolioWorld.tsx
git commit -m "feat: extend the sea with a far-water ring to 1600 m"
```

---

## Phase 2 — Landmass

## Task 2: Seeded noise

**Files:**
- Create: `src/scene/archipelago/noise.ts`
- Test: `src/scene/archipelago/noise.test.ts` (replace the Task 0 throwaway)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function makeRng(seed: number): () => number` — mulberry32, returns `[0, 1)`.
  - `export function valueNoise2D(x: number, y: number, seed: number): number` — returns `[-1, 1]`, continuous.
  - `export function fbm2D(x: number, y: number, seed: number, octaves?: number): number` — returns `[-1, 1]`.

- [ ] **Step 1: Write the failing tests**

Replace `src/scene/archipelago/noise.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fbm2D, makeRng, valueNoise2D } from './noise'

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(1234)
    const b = makeRng(1234)
    const one = [a(), a(), a(), a()]
    const two = [b(), b(), b(), b()]
    expect(one).toEqual(two)
  })

  it('differs between seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('stays in [0, 1)', () => {
    const r = makeRng(99)
    for (let i = 0; i < 5000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('valueNoise2D', () => {
  it('is deterministic', () => {
    expect(valueNoise2D(3.7, -1.2, 7)).toBe(valueNoise2D(3.7, -1.2, 7))
  })

  it('stays in [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const v = valueNoise2D(i * 0.37, i * -0.61, 5)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous: a small step in input makes a small step in output', () => {
    // This is the property that makes the islands read as smooth granite
    // rather than noise. If it fails, the terrain will look spiky.
    for (let i = 0; i < 200; i++) {
      const x = i * 0.13
      const a = valueNoise2D(x, 2.0, 3)
      const b = valueNoise2D(x + 0.01, 2.0, 3)
      expect(Math.abs(a - b)).toBeLessThan(0.1)
    }
  })

  it('varies with the seed', () => {
    expect(valueNoise2D(1.5, 1.5, 1)).not.toBe(valueNoise2D(1.5, 1.5, 2))
  })
})

describe('fbm2D', () => {
  it('stays in [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const v = fbm2D(i * 0.21, i * 0.44, 11, 3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic', () => {
    expect(fbm2D(2.2, 3.3, 4, 3)).toBe(fbm2D(2.2, 3.3, 4, 3))
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/scene/archipelago/noise.test.ts`
Expected: FAIL, cannot resolve `./noise`.

- [ ] **Step 3: Implement**

Create `src/scene/archipelago/noise.ts`:

```ts
// Seeded randomness for the archipelago. Every island and every scattered pine
// must land in exactly the same place on every load and every machine, so
// nothing here may touch Math.random.

/** Mulberry32. Small, fast, good enough, and reproducible across engines. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a lattice point to [-1, 1]. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return (((h ^ (h >>> 14)) >>> 0) / 2147483648) - 1
}

/** Quintic smoothstep. C2-continuous, which is what keeps the rock smooth. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Bilinear value noise. Low frequency in, rounded whalebacks out — which is
 * exactly the shape glaciers left on Baltic granite.
 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  const v = top + (bottom - top) * fy
  return Math.max(-1, Math.min(1, v))
}

/** Summed octaves, normalised back into [-1, 1]. */
export function fbm2D(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seed + i) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  const v = sum / norm
  return Math.max(-1, Math.min(1, v))
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/scene/archipelago/noise.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/archipelago/noise.ts src/scene/archipelago/noise.test.ts
git commit -m "feat: add seeded noise for archipelago geometry"
```

---

## Task 3: Island geometry

**Files:**
- Create: `src/scene/archipelago/island.ts`
- Test: `src/scene/archipelago/island.test.ts`

**Interfaces:**
- Consumes: `fbm2D`, `valueNoise2D` from `./noise`; `BufferGeometry`, `BufferAttribute` from `three`.
- Produces:

```ts
export type IslandTier = 'near' | 'mid' | 'far'

export type IslandDef = {
  id: string
  tier: IslandTier
  /** World XZ of the island centre. */
  centre: [number, number]
  /** Semi-axes in metres, before rotation. */
  a: number
  b: number
  /** Rotation about Y, radians. */
  rotation: number
  /** Peak height in metres. */
  height: number
  seed: number
}

export type IslandSurface = {
  geometry: BufferGeometry
  /** Surface height at a world (x, z), or null outside the footprint. */
  sampleAt(x: number, z: number): number | null
  /** Slope magnitude 0..1 at a world (x, z). 0 is flat. */
  slopeAt(x: number, z: number): number
}

export function buildIsland(def: IslandDef, segments: number): IslandSurface
```

`sampleAt` and `slopeAt` are what the prop scatter in Task 6 uses to sit pines on rock, so they must agree exactly with the geometry.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/archipelago/island.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildIsland, type IslandDef } from './island'

const DEF: IslandDef = {
  id: 'test',
  tier: 'mid',
  centre: [100, -50],
  a: 60,
  b: 40,
  rotation: 0.3,
  height: 12,
  seed: 42,
}

describe('buildIsland', () => {
  it('is deterministic: the same definition gives byte-identical positions', () => {
    const one = buildIsland(DEF, 32).geometry.getAttribute('position').array
    const two = buildIsland(DEF, 32).geometry.getAttribute('position').array
    expect(Array.from(one)).toEqual(Array.from(two))
  })

  it('puts the shoreline at y = 0', () => {
    // Walk the footprint boundary. Every point on it must be at sea level,
    // or the island will either float above the water or be sliced by it.
    const s = buildIsland(DEF, 48)
    for (let i = 0; i < 32; i++) {
      const th = (i / 32) * Math.PI * 2
      const lx = Math.cos(th) * DEF.a
      const lz = Math.sin(th) * DEF.b
      const x = DEF.centre[0] + lx * Math.cos(DEF.rotation) - lz * Math.sin(DEF.rotation)
      const z = DEF.centre[1] + lx * Math.sin(DEF.rotation) + lz * Math.cos(DEF.rotation)
      const y = s.sampleAt(x, z)
      expect(y).not.toBeNull()
      expect(Math.abs(y as number)).toBeLessThan(0.05)
    }
  })

  it('is highest near the centre', () => {
    const s = buildIsland(DEF, 48)
    const centre = s.sampleAt(DEF.centre[0], DEF.centre[1]) as number
    const edge = s.sampleAt(DEF.centre[0] + DEF.a * 0.9, DEF.centre[1]) as number
    expect(centre).toBeGreaterThan(edge)
    expect(centre).toBeGreaterThan(DEF.height * 0.5)
    expect(centre).toBeLessThanOrEqual(DEF.height * 1.2)
  })

  it('returns null outside the footprint', () => {
    expect(buildIsland(DEF, 32).sampleAt(DEF.centre[0] + DEF.a * 3, DEF.centre[1])).toBeNull()
  })

  it('never rises above the stated height, allowing for the noise band', () => {
    const g = buildIsland(DEF, 48).geometry
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeLessThanOrEqual(DEF.height * 1.2)
      expect(pos.getY(i)).toBeGreaterThanOrEqual(-1.6)
    }
  })

  it('carries a skirt below the waterline so no gap can show', () => {
    const g = buildIsland(DEF, 48).geometry
    const pos = g.getAttribute('position')
    let below = 0
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.5) below++
    expect(below).toBeGreaterThan(0)
  })

  it('scales vertex count with the segment parameter', () => {
    const small = buildIsland(DEF, 16).geometry.getAttribute('position').count
    const large = buildIsland(DEF, 32).geometry.getAttribute('position').count
    expect(large).toBeGreaterThan(small)
  })

  it('reports slope as 0..1 and steeper at the shore than the summit', () => {
    const s = buildIsland(DEF, 48)
    const summit = s.slopeAt(DEF.centre[0], DEF.centre[1])
    const shore = s.slopeAt(DEF.centre[0] + DEF.a * 0.95, DEF.centre[1])
    expect(summit).toBeGreaterThanOrEqual(0)
    expect(summit).toBeLessThanOrEqual(1)
    expect(shore).toBeGreaterThan(summit)
  })

  it('writes a vertex colour attribute for the wet band and lichen', () => {
    const g = buildIsland(DEF, 32).geometry
    expect(g.getAttribute('color')).toBeDefined()
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/scene/archipelago/island.test.ts`
Expected: FAIL, cannot resolve `./island`.

- [ ] **Step 3: Implement**

Create `src/scene/archipelago/island.ts`. The height field, which the tests above pin down:

```
r      = length(u, v)                        // u,v in local units, footprint at r = 1
mask   = smoothstep(1.0, 0.55, r)
height = H * mask^1.4
       * (0.65 + 0.35 * (fbm2D(u * 2.5, v * 2.5, seed, 2) * 0.5 + 0.5))
       + H * 0.12 * valueNoise2D(u * 9.0, v * 9.0, seed + 1)
```

Requirements:

- Sample a `(segments + 1)^2` grid over local `(u, v)` in `[-1.15, 1.15]^2`, so the mesh extends past the shoreline.
- For `r <= 1`, height as above. For `1 < r <= 1.15`, ramp linearly from 0 down to `-1.5` — the underwater skirt that guarantees no gap between rock and water whatever the waves do.
- Clamp: the shoreline term must evaluate to exactly `0` at `r == 1`, since a test walks that boundary.
- Transform local `(u, v)` to world by scaling by `(a, b)`, rotating by `rotation` about Y, and translating by `centre`. Positions are baked into the geometry in **world space**, so the mesh mounts with no transform, matching how `Boat.tsx` handles the hull.
- Write a `color` attribute: darken toward a wet-rock tone within 0.8 m of `y = 0`, tint toward lichen above `0.6 * height`. Computing this per-vertex here costs nothing and saves a texture lookup in the shader.
- Call `computeVertexNormals()`.
- `sampleAt(x, z)` inverts the world transform back to local `(u, v)`, returns `null` when `r > 1`, and otherwise evaluates the identical height expression. It must agree with the baked geometry — share one internal `heightAt(u, v)` function between the two, never duplicate the formula.
- `slopeAt(x, z)` finite-differences `heightAt` over a small local delta and returns `min(1, |gradient|)`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/scene/archipelago/island.test.ts`
Expected: all PASS. If "highest near the centre" fails intermittently across seeds, the noise band is too wide — reduce the `0.35` coefficient, do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/scene/archipelago/island.ts src/scene/archipelago/island.test.ts
git commit -m "feat: build island heightfield geometry from seeded noise"
```

---

## Task 4: Layout, granite and the island meshes

**Files:**
- Create: `src/scene/archipelago/layout.ts`
- Create: `src/scene/archipelago/granite.ts`
- Create: `src/scene/archipelago/Archipelago.tsx`
- Modify: `src/scene/quality.ts`
- Modify: `src/scene/PortfolioWorld.tsx`

**Interfaces:**
- Consumes: `IslandDef`, `buildIsland` from `./island`; `makeRng` from `./noise`; `useQualityStore`.
- Produces:
  - `export const ISLANDS: readonly IslandDef[]` from `layout.ts`
  - `export function useGraniteMaterial(): MeshStandardMaterial` from `granite.ts`
  - `export function Archipelago(): JSX.Element` from `Archipelago.tsx`
  - New `settings.archipelago` on the quality store: `{ islandSegments: { near: number; mid: number; far: number }; pineDensity: number; farIslands: number }`

- [ ] **Step 1: Add the quality knobs**

In `src/scene/quality.ts`, add to the `QualitySettings` type and to all three tier entries, following that file's stated one-line-per-tier convention:

| tier | `islandSegments` near/mid/far | `pineDensity` | `farIslands` |
| --- | --- | --- | --- |
| low | 48 / 32 / 16 | 0.35 | 4 |
| medium | 72 / 48 / 24 | 0.70 | 6 |
| high | 96 / 64 / 32 | 1.00 | 9 |

- [ ] **Step 2: Write the layout**

Create `src/scene/archipelago/layout.ts` exporting `ISLANDS`. Placement is authored, not random — a visitor sees the same coastline every visit.

| id | tier | centre `[x, z]` | a x b | rotation | height | seed |
| --- | --- | --- | --- | --- | --- | --- |
| `skerry-near` | near | `[-62, -38]` | 26 x 17 | 0.4 | 4.2 | 1001 |
| `island-mid` | mid | `[95, -150]` | 70 x 44 | -0.6 | 13 | 1002 |
| `skerry-port` | mid | `[-140, 90]` | 30 x 22 | 1.1 | 5.5 | 1003 |

Then generate the far band programmatically from a fixed seed so it is still deterministic: 9 islands at radius 550-1300, bearings spread across the forward 200 degrees with a deliberate gap astern (the approved layout keeps open water behind the boat), `a` in 120-320, `b` in `0.5*a` to `0.8*a`, height 18-30, tier `far`. Export the full list; `Archipelago.tsx` slices it to `farIslands` from the quality tier.

- [ ] **Step 3: Write the granite material**

Create `src/scene/archipelago/granite.ts`. Follow the procedural-texture idiom from Global Constraints exactly.

- A 1024x1024 `CanvasTexture`: base `#8d8781`, mottled with warm pink-grey blotches (`#a4938c`, `#7a7570`, `#b3a49b`) drawn as many soft overlapping ellipses from a seeded RNG, then a light speckle pass. Baltic granite is pink-grey and blotchy, not uniform.
- `wrapS = wrapT = RepeatWrapping`, repeat around `[8, 8]`.
- `MeshStandardMaterial` with `map`, `roughness: 0.92`, `metalness: 0`, and **`vertexColors: true`** so the wet band and lichen tint written in Task 3 actually show.
- Memoise on the anisotropy setting and `gl`; dispose the texture on cleanup.

- [ ] **Step 4: Write the component**

Create `src/scene/archipelago/Archipelago.tsx`:

- Read `islandSegments` and `farIslands` from the quality store.
- `useMemo` over `ISLANDS`: slice the far band to `farIslands`, call `buildIsland(def, islandSegments[def.tier])` for each, and keep the resulting `IslandSurface[]` — Task 6 needs the same surfaces for prop scatter, so export a hook `useIslandSurfaces(): IslandSurface[]` from this file rather than building them twice.
- Render one `<mesh>` per island with the shared granite material, `castShadow={false}`, `receiveShadow={false}` (the shadow camera is `[-7, 7, 9, -9, 0.1, 80]` per `PortfolioWorld.tsx` and does not reach the islands; asking for shadows would cost a pass for nothing).
- Geometry positions are already world-space, so no transform on the mesh.
- Dispose geometries on unmount or when the memo re-runs.

- [ ] **Step 5: Mount it**

In `src/scene/PortfolioWorld.tsx`, inside `worldFrame`, after `<OceanFar />`:

```tsx
<Archipelago />
```

- [ ] **Step 6: Typecheck, lint, test, build**

Run: `npx tsc -b && npm run lint && npx vitest run && npm run build`
Expected: all clean.

- [ ] **Step 7: Verify in the running scene**

With `npm run dev`, at the `ocean` stop, orbit the full 360 degrees and check:
- The near skerry at ~72 m reads as rounded granite from **every** bearing, not just one. This is the highest-risk item in the plan: the ocean camera orbits at only ~14 m radius, so that skerry swings right past.
- Shorelines meet the water with no gap and no floating, through a full weather cycle.
- The far band reads as blue-grey silhouettes, not as sharp geometry.
- `?cond=fog` hides the land entirely, and `?cond=calm-clear` reveals it. That is intended behaviour, not a bug.
- Check the `cockpit` and `cabin` stops too — both allow full 360 degree look.
- Watch the intro flight from a cold load. If it now clips land, note it; Task 9 addresses it.

- [ ] **Step 8: Commit**

```bash
git add src/scene/archipelago/ src/scene/quality.ts src/scene/PortfolioWorld.tsx
git commit -m "feat: place the Stockholm archipelago around the boat"
```

---

## Phase 3 — Prop kit and scatter

## Task 5: Blender prop kit

**Files:**
- Create: `blender/archipelago.py`
- Modify: `blender/build.py`
- Modify: `blender/params.py`
- Create: `src/assets/models/archipelago-kit.glb` (build output, committed)

**Interfaces:**
- Consumes: the existing `blender/lib/` helpers and the material conventions in `blender/materials.py`.
- Produces: `archipelago-kit.glb` containing exactly these named root objects, each with its origin at its **base centre** and its "front" facing `-Z`, so the scatter code can place them with a position and a Y rotation alone:
  `pine_a`, `pine_b`, `pine_stunted`, `house_red`, `boathouse_red`, `jetty`, `sea_mark`, `flagpole`.

- [ ] **Step 1: Read the existing pipeline**

Read `blender/build.py`, `blender/params.py`, `blender/materials.py` and one geometry module such as `blender/fittings.py` to pick up the established idiom for parametric construction, naming and material assignment. Match it; do not invent a second style.

- [ ] **Step 2: Add kit dimensions to params**

In `blender/params.py`, add an archipelago kit section. Target real-world dimensions:

| part | dimensions | notes |
| --- | --- | --- |
| `pine_a` | 9 m tall, 3.2 m crown | Full Scots pine, bare lower trunk, layered crown |
| `pine_b` | 12 m tall, 3.8 m crown | Taller variant so the treeline is not uniform |
| `pine_stunted` | 4.5 m tall, 2.6 m crown | Wind-bent, gnarled — what grows on exposed rock |
| `house_red` | 8 x 6 m, 6.5 m ridge | Falu red `#7B3B2E`, white corner boards and window trim, grey roof |
| `boathouse_red` | 6 x 4 m, 4 m ridge | Same red, open gable end facing the water |
| `jetty` | 12 x 1.6 m, 0.6 m above water | Timber deck on piles |
| `sea_mark` | 3 m | Classic Baltic stone cairn or spar mark |
| `flagpole` | 7 m | Slim white pole with a small Swedish flag |

- [ ] **Step 3: Add a target selector to build.py**

`build.py` currently emits only the boat. Add a `--target` argument accepting `boat` (default, preserving existing behaviour exactly) and `archipelago`. Do not change what `--target boat` does.

- [ ] **Step 4: Write the kit builder**

Create `blender/archipelago.py` building the eight parts parametrically. Constraints:

- Origin at base centre, front facing `-Z`, `+Y` up in the exported GLB (matching the boat's convention).
- **Low poly.** These are background props rendered as instances. Pines are a trunk plus a handful of layered cones, not a needle simulation. Whole-kit budget is under 200 KB uncompressed, because there is no draco or meshopt here.
- Flat-ish shading with a small number of materials shared across parts, so the instanced draw calls stay few.

- [ ] **Step 5: Build and verify**

```bash
npm run model:build -- --target archipelago
npm run model:verify
ls -l src/assets/models/archipelago-kit.glb
```

Expected: the GLB exists, all eight named objects are present, and the file is under 200 KB. If it is over, reduce crown segment counts first.

- [ ] **Step 6: Commit**

```bash
git add blender/archipelago.py blender/build.py blender/params.py src/assets/models/archipelago-kit.glb
git commit -m "feat: add parametric archipelago prop kit"
```

---

## Task 6: Prop scatter

**Files:**
- Create: `src/scene/archipelago/scatter.ts`
- Test: `src/scene/archipelago/scatter.test.ts`
- Create: `src/scene/archipelago/props.tsx`
- Modify: `src/scene/archipelago/layout.ts`
- Modify: `src/scene/archipelago/Archipelago.tsx`

**Interfaces:**
- Consumes: `IslandSurface` from `./island`; `makeRng` from `./noise`; `useIslandSurfaces` from `./Archipelago`.
- Produces:

```ts
export type PropKind =
  | 'pine_a' | 'pine_b' | 'pine_stunted'
  | 'house_red' | 'boathouse_red' | 'jetty' | 'sea_mark' | 'flagpole'

export type Placement = {
  kind: PropKind
  /** World position, y already snapped to the island surface. */
  position: [number, number, number]
  /** Rotation about Y, radians. */
  rotation: number
  scale: number
}

export function scatterPines(
  surface: IslandSurface,
  def: IslandDef,
  count: number,
  seed: number,
): Placement[]
```

- [ ] **Step 1: Write the failing tests**

Create `src/scene/archipelago/scatter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildIsland, type IslandDef } from './island'
import { scatterPines } from './scatter'

const DEF: IslandDef = {
  id: 'test', tier: 'mid', centre: [0, 0],
  a: 60, b: 40, rotation: 0, height: 12, seed: 42,
}
const SURFACE = buildIsland(DEF, 64)

describe('scatterPines', () => {
  it('is deterministic for a seed', () => {
    const a = scatterPines(SURFACE, DEF, 40, 7)
    const b = scatterPines(SURFACE, DEF, 40, 7)
    expect(a).toEqual(b)
  })

  it('places every pine on the island surface, not floating or buried', () => {
    for (const p of scatterPines(SURFACE, DEF, 60, 3)) {
      const y = SURFACE.sampleAt(p.position[0], p.position[2])
      expect(y).not.toBeNull()
      expect(Math.abs(p.position[1] - (y as number))).toBeLessThan(0.01)
    }
  })

  it('keeps pines off the bare shore zone', () => {
    // Trees do not grow on the wave-washed rock at the waterline.
    for (const p of scatterPines(SURFACE, DEF, 60, 3)) {
      expect(p.position[1]).toBeGreaterThan(DEF.height * 0.3)
    }
  })

  it('respects a minimum spacing', () => {
    const ps = scatterPines(SURFACE, DEF, 60, 3)
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].position[0] - ps[j].position[0]
        const dz = ps[i].position[2] - ps[j].position[2]
        expect(Math.hypot(dx, dz)).toBeGreaterThan(3.0)
      }
    }
  })

  it('never returns more than asked for', () => {
    expect(scatterPines(SURFACE, DEF, 25, 5).length).toBeLessThanOrEqual(25)
  })

  it('returns nothing when asked for nothing', () => {
    expect(scatterPines(SURFACE, DEF, 0, 5)).toEqual([])
  })

  it('varies scale and rotation so the treeline is not uniform', () => {
    const ps = scatterPines(SURFACE, DEF, 40, 9)
    expect(new Set(ps.map((p) => p.scale)).size).toBeGreaterThan(5)
    expect(new Set(ps.map((p) => p.rotation)).size).toBeGreaterThan(5)
  })

  it('mixes the pine variants', () => {
    const kinds = new Set(scatterPines(SURFACE, DEF, 60, 9).map((p) => p.kind))
    expect(kinds.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/scene/archipelago/scatter.test.ts`
Expected: FAIL, cannot resolve `./scatter`.

- [ ] **Step 3: Implement the scatter**

Create `src/scene/archipelago/scatter.ts`. Rejection sampling with a spacing check:

- Draw candidate local `(u, v)` from the seeded RNG inside the unit disc, convert to world, and query `surface.sampleAt`.
- Reject when: outside the footprint, `y <= height * 0.3` (bare shore), or `surface.slopeAt > 0.6` (too steep for a tree).
- Reject when within 3.5 m of an already-accepted pine. Test asserts `> 3.0`, so 3.5 leaves headroom.
- Cap total attempts at `count * 40` so a small or steep island terminates rather than spinning.
- Pick `pine_a` / `pine_b` / `pine_stunted` by weight, biasing `pine_stunted` at lower heights and near the shore.
- `scale` in 0.75-1.35, `rotation` in `[0, 2*PI)`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/scene/archipelago/scatter.test.ts`
Expected: all PASS.

- [ ] **Step 5: Add authored props to the layout**

In `layout.ts`, export `AUTHORED_PROPS: readonly Placement[]` — the landmarks, hand-placed rather than scattered, because a house is a composition decision:
- `house_red` and `flagpole` on `island-mid`, set back from the shore on a shoulder of rock.
- `jetty` on `island-mid` at a shoreline point, running out into the water.
- `boathouse_red` on `island-mid` beside the jetty.
- `sea_mark` on `skerry-near`.

Snap each `y` to the island surface at load, in `props.tsx`, rather than hardcoding a height that would drift if the noise ever changes.

- [ ] **Step 6: Write the instanced renderer**

Create `src/scene/archipelago/props.tsx`:

- `useGLTF('../assets/models/archipelago-kit.glb?url')` with a module-scope `useGLTF.preload`, matching `Boat.tsx:14` and `Parrot.tsx:12`.
- Per `PropKind`, one `<instancedMesh>` sized to the total placements of that kind.
- Fill the instance matrices once in a `useMemo` / `useLayoutEffect`, then set `instanceMatrix.needsUpdate = true`. **Never** rebuild matrices per frame — these are static.
- Multiply pine counts by `pineDensity` from the quality tier. Per the spec: ~180 pines on `island-mid`, ~20 stunted on `skerry-port`, and **zero on `skerry-near`** — bare granite is the entire point of that skerry.
- No props at all on the far band.
- `frustumCulled` may stay on; each instanced mesh gets a bounding sphere covering its island.

- [ ] **Step 7: Mount and verify**

Render `<Props />` from `Archipelago.tsx` so both share `useIslandSurfaces()` and the surfaces are built once.

Run: `npx tsc -b && npm run lint && npx vitest run && npm run build`

Then in the browser: pines sit on rock with no floating or sinking, the red house reads clearly at 178 m, the jetty meets the water, and `skerry-near` is bare.

- [ ] **Step 8: Commit**

```bash
git add src/scene/archipelago/
git commit -m "feat: scatter pines and place landmarks on the islands"
```

---

## Phase 4 — Traffic

## Task 7: Lanes and the spawn scheduler

**Files:**
- Create: `src/scene/traffic/rails.ts`
- Create: `src/scene/traffic/fleet.ts`
- Create: `src/scene/traffic/scheduler.ts`
- Test: `src/scene/traffic/scheduler.test.ts`

**Interfaces:**
- Consumes: `makeRng` from `../archipelago/noise`.
- Produces:

```ts
// rails.ts
export type LaneId = 'near' | 'mid' | 'far'
export type LaneDef = {
  id: LaneId
  /** Lane heading in world XZ, degrees, 0 = along -Z (the bow direction). */
  bearingDeg: number
  /** Perpendicular distance from the world origin; sign picks the side. */
  offsetM: number
  /** Lane runs from -halfLength to +halfLength about its closest point to origin. */
  halfLength: number
  maxConcurrent: number
  /** Mean seconds between spawns. */
  meanGapS: number
}
export const LANES: readonly LaneDef[]
/** World position of a vessel at distance d along the lane. */
export function lanePoint(lane: LaneDef, d: number): [number, number]
/** Lane heading as a Y rotation in radians, for a vessel travelling in dir. */
export function laneHeading(lane: LaneDef, dir: 1 | -1): number

// fleet.ts
export type VesselClass = {
  id: 'sail_a' | 'sail_b' | 'steamer' | 'tug' | 'ferry'
  modelFile: string
  lane: LaneId
  weight: number
  speedRange: [number, number]
  /** Real-world length in metres; models are normalised to this. */
  lengthM: number
  heels: boolean
}
export const FLEET: readonly VesselClass[]
export function pickClass(lane: LaneId, rng: () => number): VesselClass

// scheduler.ts
export type Vessel = {
  id: number
  classId: VesselClass['id']
  /** Distance along the lane at t = spawnedAt. */
  startD: number
  dir: 1 | -1
  speed: number
  spawnedAt: number
}
export type LaneState = { active: Vessel[]; nextId: number; nextSpawnAt: number }

export function seedLane(lane: LaneDef, rng: () => number, now: number): LaneState
export function stepLane(state: LaneState, lane: LaneDef, rng: () => number, now: number): LaneState
export function vesselDistance(v: Vessel, now: number): number
```

**Lane table:**

| lane | bearingDeg | offsetM | halfLength | maxConcurrent (high tier) | meanGapS |
| --- | --- | --- | --- | --- | --- |
| near | 105 | 160 | 300 | 3 | 200 |
| mid | 20 | 320 | 600 | 2 | 260 |
| far | 75 | 850 | 1200 | 1 | 420 |

**Fleet table:**

| id | model | lane | weight | speed m/s | lengthM | heels |
| --- | --- | --- | --- | --- | --- | --- |
| `sail_a` | `sailboat-a.glb` | near | 35 | 2.5-4.0 | 8 | yes |
| `sail_b` | `sailboat-b.glb` | near | 25 | 2.5-4.0 | 8 | yes |
| `steamer` | `steamer.glb` | mid | 20 | 5.0-5.0 | 30 | no |
| `tug` | `tug.glb` | mid | 15 | 4.0-4.0 | 20 | no |
| `ferry` | `ferry.glb` | far | 5 | 7.0-7.0 | 160 | no |

- [ ] **Step 1: Write the failing tests**

Create `src/scene/traffic/scheduler.test.ts`. These are the statistical tests the spec calls for — they are the reason the scheduler is a pure module.

```ts
import { describe, expect, it } from 'vitest'
import { makeRng } from '../archipelago/noise'
import { LANES } from './rails'
import { seedLane, stepLane, vesselDistance, type LaneState } from './scheduler'

const NEAR = LANES.find((l) => l.id === 'near')!

/** Run a lane forward and sample how many vessels are active at each step. */
function simulate(lane = NEAR, seconds = 10_000, dt = 1, seed = 1234) {
  const rng = makeRng(seed)
  let state: LaneState = seedLane(lane, rng, 0)
  const counts: number[] = []
  for (let t = 0; t < seconds; t += dt) {
    state = stepLane(state, lane, rng, t)
    counts.push(state.active.length)
  }
  return counts
}

describe('traffic scheduler', () => {
  it('never exceeds the concurrent cap', () => {
    expect(Math.max(...simulate())).toBeLessThanOrEqual(NEAR.maxConcurrent)
  })

  it('leaves the water empty a meaningful fraction of the time', () => {
    // The owner asked for "sometimes no boats". A Poisson process with
    // lambda*T ~= 1 gives P(0) ~= 0.37. Anything outside this band means the
    // rate or the transit time has drifted and the feature stops reading as
    // random traffic.
    const counts = simulate()
    const empty = counts.filter((c) => c === 0).length / counts.length
    expect(empty).toBeGreaterThan(0.20)
    expect(empty).toBeLessThan(0.60)
  })

  it('shows several boats at once some of the time', () => {
    const counts = simulate()
    expect(counts.filter((c) => c >= 2).length / counts.length).toBeGreaterThan(0.05)
  })

  it('seeds a non-degenerate spread of initial occupancies', () => {
    // Without seeding, every visitor's first view is an empty sea and boats
    // only trickle in over minutes. For a visit that may last ninety seconds
    // that would mean the feature is effectively never seen.
    const initial = new Set<number>()
    for (let s = 0; s < 400; s++) initial.add(seedLane(NEAR, makeRng(s), 0).active.length)
    expect(initial.size).toBeGreaterThan(2)
    expect(initial.has(0)).toBe(true)
    expect([...initial].some((n) => n >= 2)).toBe(true)
  })

  it('despawns vessels once they pass the end of the lane', () => {
    const counts = simulate(NEAR, 4000)
    // If nothing ever despawned the count would pin at the cap and stay there.
    expect(counts.filter((c) => c === 0).length).toBeGreaterThan(0)
  })

  it('keeps every active vessel within the lane bounds', () => {
    const rng = makeRng(77)
    let state = seedLane(NEAR, rng, 0)
    for (let t = 0; t < 4000; t++) {
      state = stepLane(state, NEAR, rng, t)
      for (const v of state.active) {
        expect(Math.abs(vesselDistance(v, t))).toBeLessThanOrEqual(NEAR.halfLength + 1)
      }
    }
  })

  it('is deterministic for a seed', () => {
    expect(simulate(NEAR, 2000, 1, 5)).toEqual(simulate(NEAR, 2000, 1, 5))
  })

  it('respects each lane cap, not just the near one', () => {
    for (const lane of LANES) {
      expect(Math.max(...simulate(lane, 20_000))).toBeLessThanOrEqual(lane.maxConcurrent)
    }
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/scene/traffic/scheduler.test.ts`
Expected: FAIL, cannot resolve `./rails`.

- [ ] **Step 3: Implement rails.ts and fleet.ts**

From the two tables above. `lanePoint` places the lane as a line at perpendicular distance `offsetM` from the origin on the given bearing; `d` runs along it from `-halfLength` to `+halfLength`.

- [ ] **Step 4: Implement scheduler.ts**

- `vesselDistance(v, now) = v.startD + v.dir * v.speed * (now - v.spawnedAt)`.
- `stepLane` removes vessels whose `|distance| > halfLength`, then spawns if `now >= nextSpawnAt` and `active.length < maxConcurrent`. A new vessel enters at `-dir * halfLength` so it comes in from an end.
- Next gap is exponential: `nextSpawnAt = now - Math.log(1 - rng()) * meanGapS`.
- **When the cap blocks a spawn, still reschedule** `nextSpawnAt`. Otherwise the scheduler fires the instant a slot frees and the lane pins at the cap forever, which is exactly what the "empty a meaningful fraction of the time" test catches.
- `seedLane` draws `k` from the stationary distribution and places each of the `k` vessels at a uniformly random point along the lane, with a random direction, so the opening view is already populated.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/scene/traffic/scheduler.test.ts`
Expected: all PASS. If the empty-fraction test fails, tune `meanGapS` — do not widen the assertion band, since that band *is* the requested behaviour.

- [ ] **Step 6: Commit**

```bash
git add src/scene/traffic/
git commit -m "feat: add traffic lanes and Poisson spawn scheduler"
```

---

## Task 8: Vessels on the water

**Files:**
- Create: `src/scene/traffic/normalise.ts`
- Create: `src/scene/traffic/useTraffic.ts`
- Create: `src/scene/traffic/Traffic.tsx`
- Create: `src/scene/traffic/Wake.tsx`
- Create: `src/assets/models/traffic/*.glb` (five downloads)
- Modify: `src/scene/quality.ts`
- Modify: `src/scene/PortfolioWorld.tsx`
- Modify: `ATTRIBUTION.md`

**Interfaces:**
- Consumes: `LANES`, `lanePoint`, `laneHeading` from `./rails`; `FLEET` from `./fleet`; `seedLane`, `stepLane`, `vesselDistance` from `./scheduler`; `sampleHeight` from `../water/waves`; `heelAngle`, `WIND_DIR` from `../wind`; `sampleConditions` from `../conditions`.
- Produces: `export function Traffic(): JSX.Element`; new `settings.traffic` on the quality store: `{ maxConcurrent: { near: number; mid: number; far: number }; wakes: boolean }`.

- [ ] **Step 1: Download the vessel models**

All five verified CC-BY 3.0, 251 KB total. Download URL is `https://static.poly.pizza/<ResourceID>.glb`.

```bash
mkdir -p src/assets/models/traffic
cd src/assets/models/traffic
curl -fL -o sailboat-a.glb https://static.poly.pizza/0539464a-5deb-43b0-9a1d-dab0dbd55436.glb
curl -fL -o sailboat-b.glb https://static.poly.pizza/484354dd-3c19-42b3-8bf4-399b66e12c39.glb
curl -fL -o tug.glb       https://static.poly.pizza/3bf3b70c-6e61-4a18-aff0-0d7c6eef69ac.glb
curl -fL -o steamer.glb   https://static.poly.pizza/d51c2fe4-6d94-4f83-bd5c-bb99e1bd926e.glb
curl -fL -o ferry.glb     https://static.poly.pizza/f49539e8-cda3-4913-9a4b-774047f06dca.glb
ls -l
```

Expected sizes: 17844, 40140, 82920, 50952, 65640 bytes.

- [ ] **Step 2: Add the attribution**

Append five entries to `ATTRIBUTION.md` in the same form as the existing parrot entry. Creators: "Poly by Google" (`sailboat-a`, `tug`, `ferry`), "jeremy" (`sailboat-b`, `steamer`). All CC-BY 3.0. Model pages: `https://poly.pizza/m/7AOnch2wREC`, `/m/5u49Hzbo5WH`, `/m/eEbXA8_6MeJ`, `/m/aOikPp4rz68`, `/m/cPiY_8RZMHE`.

- [ ] **Step 3: Add the traffic quality knobs**

In `src/scene/quality.ts`:

| tier | `maxConcurrent` near/mid/far | `wakes` |
| --- | --- | --- |
| low | 1 / 1 / 0 | false |
| medium | 2 / 1 / 1 | true |
| high | 3 / 2 / 1 | true |

These override `LaneDef.maxConcurrent` at runtime; `rails.ts` holds the high-tier values as its authored defaults.

- [ ] **Step 4: Write normalise.ts**

None of the five models has a verified real-world scale or up-axis, so trusting them is not an option.

- `measureAndNormalise(object: Object3D, lengthM: number): { scale: number; yaw: number }`
- Compute a `Box3` over the object, take its longest horizontal dimension as the vessel's length, and return `scale = lengthM / thatLength`.
- Return the yaw needed to point the longest horizontal axis along `-Z`, matching the project's bow convention.
- Memoise per model URL — this runs once, not per vessel.

- [ ] **Step 5: Write useTraffic.ts**

A hook holding one `LaneState` per lane in a ref, advanced in `useFrame` by `stepLane`, seeded once with `seedLane` on mount. Caps come from the quality store, not from `LaneDef` directly. Returns the flat list of active vessels with their current lane distance. Keep all of this in refs, not React state — it changes every frame and must not re-render.

- [ ] **Step 6: Write Traffic.tsx**

For each active vessel:
- World XZ from `lanePoint(lane, vesselDistance(v, t))`.
- `y` from `sampleHeight(x, z, t, ampScale)` where `ampScale` comes from `sampleConditions(t)`, exactly as the player's boat does.
- Pitch and roll from finite differences of `sampleHeight` about the vessel position, scaled by its `lengthM` and beam. **No changes to `waves.ts`** — `sampleHeight` already takes a world position.
- Heading from `laneHeading(lane, v.dir)`, plus `heelAngle()` for classes with `heels: true`, and a heading bias relative to `WIND_DIR` so sailboats are not sailing straight into the wind.
- Mounted inside `worldFrame` so vessels rock with the horizon.
- **No pointer handlers.** Traffic is deliberately not interactive: a click in this scene means "this is an exhibit", and diluting that costs more than the vessels gain.
- Clone the GLB scene per vessel (drei's `useGLTF` returns a shared graph; mutating it directly would move every vessel of that class together).

- [ ] **Step 7: Write Wake.tsx**

A stretched plane behind each vessel, additive blend, `depthWrite={false}`, fading along its length and with distance. Width scales with `lengthM`. Skipped entirely when `wakes` is false.

- [ ] **Step 8: Mount it**

In `PortfolioWorld.tsx`, inside `worldFrame`, after `<Archipelago />`:

```tsx
<Traffic />
```

- [ ] **Step 9: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run && npm run build`

In the browser, over several minutes and several reloads:
- Vessel scale is believable against the 26 ft Maxi 77 and against the islands. A ferry at 160 m must dwarf the boat; a sailboat at 8 m must not.
- Some reloads open on an empty sea, some on one boat, some on several. That is the requested behaviour and comes from `seedLane`.
- No vessel pops into existence in plain view — check they enter from the fogged distance.
- Vessels bob with the same sea the player's boat is on, not against it.
- Bows point the way they are travelling.

- [ ] **Step 10: Commit**

```bash
git add src/scene/traffic/ src/assets/models/traffic/ src/scene/quality.ts src/scene/PortfolioWorld.tsx ATTRIBUTION.md
git commit -m "feat: add randomised boat traffic on rails"
```

---

## Task 9: Integration pass

**Files:**
- Modify: `src/scene/introFlight.ts` (only if the intro clips land)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Check the intro flight**

Load cold and watch the intro. `IntroClouds`, `IntroTitle` and `introFlight.ts` were authored against an empty sea. If the flight path now passes through or unpleasantly close to an island, nudge the path — not the island, which is placed for the three camera stops that matter most.

- [ ] **Step 2: Performance check**

Run the scene on the `low` tier (force it via the mechanism in `quality.ts`) and confirm the frame rate holds. `QualityMonitor` only adapts DPR, never geometry, so if geometry is the bottleneck the tier tables in Tasks 4 and 8 are the place to fix it.

- [ ] **Step 3: Update CLAUDE.md**

- Add `scene/archipelago/` and `scene/traffic/` to the folder conventions.
- Correct the existing note that says exhibits live in `src/exhibits/` — they are in `src/scene/exhibits/`.
- Update "Current focus".
- Note that `npm test` now exists.

- [ ] **Step 4: Full verification**

Run: `npx tsc -b && npm run lint && npx vitest run && npm run build`
Then dispatch the `checker` agent over the working diff.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: integrate archipelago and traffic, update docs"
```

---

## Self-Review

**Spec coverage.** Far-water skirt -> Task 1. Island geometry and layout -> Tasks 2-4. Granite -> Task 4. Blender kit -> Task 5. Prop scatter -> Task 6. Fleet, lanes, scheduler -> Task 7. Vessel rendering, wakes, attribution, scale normalisation -> Task 8. Quality tiers -> split across Tasks 4 and 8, each landing with the consumer that needs it. Risks 1-3 and 5 -> verification steps in Tasks 1, 4, 6, 9. Risk 4 (fog hides land) -> confirmed as intended in Task 4 Step 7. Risk 6 (second Blender target) -> Task 5 Step 3.

**Gap found and closed.** The spec's verification section calls for a statistical scheduler test, but the repo had no test runner at all. Added as Task 0.

**Type consistency.** `IslandDef`, `IslandSurface`, `Placement`, `PropKind`, `LaneDef`, `VesselClass`, `Vessel` and `LaneState` are each declared once, in the task that creates them, and referenced by those exact names afterwards. `sampleAt` / `slopeAt` keep their names from Task 3 through Task 6. `maxConcurrent` appears in both `LaneDef` and the quality store; Task 8 Step 3 states explicitly which wins.

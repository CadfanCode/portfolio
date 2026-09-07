import type { IslandDef } from './island'
import { makeRng } from './noise'

/**
 * Authored placement of the three named islands the boat actually passes
 * close to. These are composition, not procedural fill — a visitor sees the
 * same coastline every visit, so nothing here may read from `Math.random`.
 * See `island.ts` for what each field means.
 */
const NAMED_ISLANDS: readonly IslandDef[] = [
  { id: 'skerry-near', tier: 'near', centre: [-62, -38], a: 26, b: 17, rotation: 0.4, height: 4.2, seed: 1001 },
  { id: 'island-mid', tier: 'mid', centre: [95, -150], a: 70, b: 44, rotation: -0.6, height: 13, seed: 1002 },
  { id: 'skerry-port', tier: 'mid', centre: [-140, 90], a: 30, b: 22, rotation: 1.1, height: 5.5, seed: 1003 },
]

/** How many far-band islands to generate. Quality tiers slice this list down
 *  to their own `farIslands` count; generating the full set once and slicing
 *  keeps the same nine islands in the same order on every tier, so raising
 *  the tier only ever adds islands rather than swapping which ones appear. */
const FAR_COUNT = 9
/** Fixed seed for the far band's own RNG stream. A constant, not a magic
 *  number reused from the named islands, so touching one never perturbs the
 *  other. */
const FAR_SEED = 2001

/**
 * The forward arc the far band is spread across, in the `bearingDeg`
 * convention `traffic/rails.ts` also uses: 0 degrees is along -Z, the bow
 * direction, and the angle increases clockwise. Centring 200 degrees on the
 * bow and leaving the remaining 160 degrees astern bare is the "deliberate
 * gap astern" the plan calls for — the view back toward where the boat came
 * from stays open water.
 */
const FAR_ARC_DEG = 200
const FAR_ARC_HALF = FAR_ARC_DEG / 2

/** Build the generated far band once, from a fixed seed, so it is identical
 *  on every load and every machine despite being procedural rather than
 *  hand-placed — see the module doc. */
function buildFarBand(): IslandDef[] {
  const rng = makeRng(FAR_SEED)
  const islands: IslandDef[] = []
  for (let i = 0; i < FAR_COUNT; i++) {
    // Evenly spaced across the arc, then jittered within its own slot so the
    // band doesn't read as a picket fence of equally spaced silhouettes.
    // FAR_COUNT is a fixed constant above 1, so this never divides by zero.
    const slot = i / (FAR_COUNT - 1)
    const jitter = (rng() - 0.5) * (FAR_ARC_DEG / FAR_COUNT) * 0.6
    const bearingDeg = -FAR_ARC_HALF + slot * FAR_ARC_DEG + jitter
    const bearing = (bearingDeg * Math.PI) / 180

    const radius = 550 + rng() * (1300 - 550)
    const a = 120 + rng() * (320 - 120)
    const b = a * (0.5 + rng() * 0.3)
    const height = 18 + rng() * (30 - 18)
    const rotation = rng() * Math.PI * 2

    // bearingDeg = 0 is along -Z (the bow), increasing clockwise, matching
    // rails.ts: x = R * sin(bearing), z = -R * cos(bearing).
    const x = radius * Math.sin(bearing)
    const z = -radius * Math.cos(bearing)

    islands.push({
      id: `far-${i}`,
      tier: 'far',
      centre: [x, z],
      a,
      b,
      rotation,
      height,
      seed: 3000 + i,
    })
  }
  return islands
}

/**
 * Every island in the scene: the three named islands the camera passes
 * close to, followed by the generated far band. `Archipelago.tsx` slices the
 * far band to the quality tier's `farIslands` count; the named islands are
 * always all present.
 */
export const ISLANDS: readonly IslandDef[] = [...NAMED_ISLANDS, ...buildFarBand()]

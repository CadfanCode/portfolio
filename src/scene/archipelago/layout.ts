import type { IslandDef } from './island'
import { makeRng } from './noise'
import type { Placement, ScatterKind, ScatterLayer } from './scatter'

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

/* -------------------------------------------------------------------------- */
/*  Scatter dressing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The mix used by every proper treeline (`island-mid`, `skerry-port`): tall
 * pine dominant on the high ground, stunted pine and birch taking over near
 * the shore. Shared verbatim between the two so the two hero islands read as
 * the same coastline rather than two different forests.
 */
const TREELINE_KINDS: ScatterKind[] = [
  { kind: 'pine_a', weight: 0.42, lowGroundWeight: 0.17 },
  { kind: 'pine_b', weight: 0.28, lowGroundWeight: 0.1 },
  { kind: 'pine_stunted', weight: 0.15, lowGroundWeight: 0.65 },
  { kind: 'birch', weight: 0.15, lowGroundWeight: 0.08 },
]

/**
 * Height above sea level below which nothing grows: the splash zone.
 *
 * An absolute band in metres, not a fraction of the island's height, because
 * that is what sets it in reality — how far spray and winter ice reach up the
 * rock depends on the sea, not on how tall the land behind it happens to be.
 * As a fraction it was 0.3, which on the 13 m mid island kept every tree above
 * 3.9 m and left a wide bare apron round the shore that read as a sand beach
 * rather than as granite. Inner-archipelago pines come very nearly down to the
 * waterline — used as `minHeight` on the proper treelines below; the smaller
 * scrub and rock layers get their own, tighter bands per the authored table.
 */
const SHORE_BAND_M = 1.2

/**
 * Per-island dressing layers, authored rather than derived — see the module
 * doc on why nothing here may read from `Math.random`. Every layer carries
 * its own seed, never one borrowed from `ISLANDS` above or from a sibling
 * layer, so retuning one scatter never perturbs another (same reasoning as
 * the old `PINE_SEEDS`).
 *
 * `props.tsx` scatters each island's layers in array order, rocks first,
 * then trees, then juniper, each avoiding everything scattered before it (and
 * every authored building) so nothing grows through rock, trunk, or roof.
 */
export const ISLAND_DRESSING: Record<string, ScatterLayer[]> = {
  // The bare skerry, but a real one: granite and scrub, no proper forest and
  // no buildings — see `AUTHORED_PROPS` below for its one dinghy and sea mark.
  'skerry-near': [
    {
      kinds: [
        { kind: 'boulder_a', weight: 0.45 },
        { kind: 'boulder_b', weight: 0.35 },
        { kind: 'rock_stack', weight: 0.2 },
      ],
      count: 20,
      seed: 6001,
      minSpacing: 3.2,
      minHeight: 0.2,
      maxHeight: 2.6,
      maxSlope: 0.85,
      scaleRange: [0.8, 1.6],
    },
    {
      kinds: [
        { kind: 'pine_stunted', weight: 0.8 },
        { kind: 'pine_a', weight: 0.2 },
      ],
      count: 6,
      seed: 6003,
      minSpacing: 5.0,
      minHeight: 1.6,
      maxHeight: 4.2,
      maxSlope: 0.5,
      scaleRange: [0.7, 1.0],
    },
    {
      kinds: [{ kind: 'juniper', weight: 1.0 }],
      count: 24,
      seed: 6002,
      minSpacing: 2.2,
      minHeight: 0.6,
      maxHeight: 4.2,
      maxSlope: 0.8,
      scaleRange: [0.7, 1.4],
    },
  ],
  // The hero island: full treeline, dense juniper understory, shore boulders.
  'island-mid': [
    {
      kinds: [
        { kind: 'boulder_a', weight: 0.4 },
        { kind: 'boulder_b', weight: 0.35 },
        { kind: 'rock_stack', weight: 0.25 },
      ],
      count: 40,
      seed: 6013,
      minSpacing: 4.0,
      minHeight: 0.2,
      maxHeight: 3.0,
      maxSlope: 0.9,
      scaleRange: [0.9, 1.8],
    },
    {
      kinds: TREELINE_KINDS,
      count: 240,
      seed: 6011,
      minSpacing: 3.5,
      minHeight: SHORE_BAND_M,
      maxHeight: 13,
      maxSlope: 0.6,
      scaleRange: [0.75, 1.35],
    },
    {
      kinds: [{ kind: 'juniper', weight: 1.0 }],
      count: 80,
      seed: 6012,
      minSpacing: 2.4,
      minHeight: 0.5,
      maxHeight: 13,
      maxSlope: 0.85,
      scaleRange: [0.7, 1.3],
    },
  ],
  // Smaller sibling of island-mid, same mix, fewer of everything.
  'skerry-port': [
    {
      kinds: [
        { kind: 'boulder_a', weight: 0.4 },
        { kind: 'boulder_b', weight: 0.35 },
        { kind: 'rock_stack', weight: 0.25 },
      ],
      count: 22,
      seed: 6023,
      minSpacing: 3.4,
      minHeight: 0.2,
      maxHeight: 2.6,
      maxSlope: 0.9,
      scaleRange: [0.8, 1.6],
    },
    {
      kinds: TREELINE_KINDS,
      count: 44,
      seed: 6021,
      minSpacing: 3.5,
      minHeight: SHORE_BAND_M,
      maxHeight: 5.5,
      maxSlope: 0.6,
      scaleRange: [0.75, 1.2],
    },
    {
      kinds: [{ kind: 'juniper', weight: 1.0 }],
      count: 30,
      seed: 6022,
      minSpacing: 2.2,
      minHeight: 0.5,
      maxHeight: 5.5,
      maxSlope: 0.85,
      scaleRange: [0.7, 1.3],
    },
  ],
}

/**
 * The far band's one shared rule: at 550–1300 m and behind `fogExp2` density
 * 0.0016, what matters is a ragged forested silhouette, not individual trees
 * — so every far island gets the same sparse pine scatter, sized to its own
 * footprint, rather than a bespoke table like the named islands.
 *
 * `far-1` is deliberately given no layer at all: it is kept as the second
 * bare rock for variation, alongside `skerry-near`. Do not "fix" this by
 * adding a layer to it — the gap is intentional, not a missed island.
 */
export function farBandDressing(def: IslandDef): ScatterLayer[] {
  if (def.id === 'far-1') return []

  const count = Math.min(180, Math.max(40, Math.round((def.a * def.b) / 250)))
  return [
    {
      kinds: [
        { kind: 'pine_a', weight: 0.5 },
        { kind: 'pine_b', weight: 0.5 },
      ],
      count,
      // Derived from the island's own far-band seed rather than a shared
      // constant, so every far island's silhouette is distinct despite
      // sharing one rule — offset well clear of `buildFarBand`'s own
      // 3000-range seeds so terrain and dressing never correlate.
      seed: def.seed + 50_000,
      minSpacing: 7,
      minHeight: 2,
      maxHeight: def.height,
      maxSlope: 0.7,
      // Bounded by the far islands' own 18–30 m height, not by the fog: the
      // nearest far island sits 640 m out, where even a scale-1 pine already
      // subtends a readable ~24 px at 1080p. An earlier pass oversized these
      // to [1.3, 2.3] to fight the fog and instead produced 29 m trees taller
      // than the 18-30 m rock carrying them — a mistake that reads the moment
      // it resolves, which at 640 m it does. Do not re-enlarge this to
      // compensate for fog; use the far islands' own fog term for that.
      scaleRange: [0.9, 1.5],
    },
  ]
}

/* -------------------------------------------------------------------------- */
/*  Authored props                                                             */
/* -------------------------------------------------------------------------- */

const ISLAND_MID = NAMED_ISLANDS.find((d) => d.id === 'island-mid')!
const SKERRY_NEAR = NAMED_ISLANDS.find((d) => d.id === 'skerry-near')!
const SKERRY_PORT = NAMED_ISLANDS.find((d) => d.id === 'skerry-port')!

/** Convert a local unit-disc fraction (see `island.ts`) to an island's world
 *  XZ. Authoring landmarks in the same footprint coordinates the terrain
 *  itself is built in beats guessing raw metres by eye, and keeps a
 *  placement valid even if an island's `a`/`b`/`rotation` is ever retuned. */
function localToWorld(def: IslandDef, u: number, v: number): [number, number] {
  const cos = Math.cos(def.rotation)
  const sin = Math.sin(def.rotation)
  const lx = u * def.a
  const lz = v * def.b
  return [def.centre[0] + lx * cos - lz * sin, def.centre[1] + lx * sin + lz * cos]
}

/** Heading (radians about Y) that points a kit part's local -Z axis — its
 *  "front", per the kit's export convention — away from the island centre at
 *  world `(x, z)`. Used for the jetty and boathouse, which must face the
 *  open water rather than the rock. */
function headingOutward(def: IslandDef, x: number, z: number): number {
  const dx = x - def.centre[0]
  const dz = z - def.centre[1]
  return Math.atan2(-dx, -dz)
}

/**
 * The hand-placed landmarks: a house and flagpole set back on a shoulder of
 * `island-mid`, a jetty running out from its shore with a boathouse beside
 * it, and a sea mark on the bare `skerry-near`. Composition, not procedural
 * fill — see `scatterLayer` in `scatter.ts` and `ISLAND_DRESSING` above for
 * the scattered trees, scrub and rock these sit among.
 *
 * `y` is left at 0 here and snapped to the owning island's surface by
 * `props.tsx` when it builds the instance matrices, rather than hardcoded:
 * a hardcoded height would drift the moment the noise powering the terrain
 * changes.
 */
export const AUTHORED_PROPS: readonly Placement[] = (() => {
  const house = localToWorld(ISLAND_MID, 0.2, 0.35)
  const flagpole = localToWorld(ISLAND_MID, 0.15, 0.47)
  const jetty = localToWorld(ISLAND_MID, -0.8, -0.55)
  const boathouse = localToWorld(ISLAND_MID, -0.72, -0.62)
  const seaMark = localToWorld(SKERRY_NEAR, 0.1, -0.2)
  // island-mid: a second, larger house on the opposite shoulder, a sauna
  // tucked beside the boathouse, and a dinghy pulled up next to the jetty.
  const houseB = localToWorld(ISLAND_MID, 0.45, -0.1)
  const sauna = localToWorld(ISLAND_MID, -0.62, -0.72)
  const dinghyMid = localToWorld(ISLAND_MID, -0.84, -0.46)
  // skerry-port: its own house, boathouse and jetty, so the second named
  // island reads as inhabited rather than as a smaller copy of island-mid.
  const housePort = localToWorld(SKERRY_PORT, 0.1, -0.15)
  const boathousePort = localToWorld(SKERRY_PORT, 0.55, 0.5)
  const jettyPort = localToWorld(SKERRY_PORT, 0.72, 0.62)
  // skerry-near: a dinghy drawn up beside the sea mark, the only sign of
  // visitors on the otherwise bare rock.
  const dinghyNear = localToWorld(SKERRY_NEAR, -0.35, 0.2)

  return [
    {
      kind: 'house_red',
      position: [house[0], 0, house[1]],
      rotation: headingOutward(ISLAND_MID, house[0], house[1]),
      scale: 1,
    },
    { kind: 'flagpole', position: [flagpole[0], 0, flagpole[1]], rotation: 0, scale: 1 },
    {
      kind: 'jetty',
      position: [jetty[0], 0, jetty[1]],
      rotation: headingOutward(ISLAND_MID, jetty[0], jetty[1]),
      scale: 1,
    },
    {
      kind: 'boathouse_red',
      position: [boathouse[0], 0, boathouse[1]],
      rotation: headingOutward(ISLAND_MID, boathouse[0], boathouse[1]),
      scale: 1,
    },
    { kind: 'sea_mark', position: [seaMark[0], 0, seaMark[1]], rotation: 0, scale: 1 },
    {
      kind: 'house_red_b',
      position: [houseB[0], 0, houseB[1]],
      rotation: headingOutward(ISLAND_MID, houseB[0], houseB[1]),
      scale: 1,
    },
    {
      kind: 'sauna_red',
      position: [sauna[0], 0, sauna[1]],
      rotation: headingOutward(ISLAND_MID, sauna[0], sauna[1]),
      scale: 1,
    },
    { kind: 'dinghy', position: [dinghyMid[0], 0, dinghyMid[1]], rotation: 0, scale: 1 },
    {
      kind: 'house_red_b',
      position: [housePort[0], 0, housePort[1]],
      rotation: headingOutward(SKERRY_PORT, housePort[0], housePort[1]),
      scale: 1,
    },
    {
      kind: 'boathouse_red',
      position: [boathousePort[0], 0, boathousePort[1]],
      rotation: headingOutward(SKERRY_PORT, boathousePort[0], boathousePort[1]),
      scale: 1,
    },
    {
      kind: 'jetty',
      position: [jettyPort[0], 0, jettyPort[1]],
      rotation: headingOutward(SKERRY_PORT, jettyPort[0], jettyPort[1]),
      scale: 1,
    },
    { kind: 'dinghy', position: [dinghyNear[0], 0, dinghyNear[1]], rotation: 0, scale: 1 },
  ]
})()

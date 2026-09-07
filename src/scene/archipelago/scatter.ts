import type { IslandDef, IslandSurface } from './island'
import { makeRng } from './noise'

/** Every kit part `props.tsx` can instance, matching the named root objects
 *  in `archipelago-kit.glb` exactly — see `blender/archipelago.py`. */
export type PropKind =
  | 'pine_a' | 'pine_b' | 'pine_stunted'
  | 'house_red' | 'boathouse_red' | 'jetty' | 'sea_mark' | 'flagpole'

/** One instance of a kit part, ready to compose into an instance matrix. */
export type Placement = {
  kind: PropKind
  /** World position, y already snapped to the island surface. */
  position: [number, number, number]
  /** Rotation about Y, radians. */
  rotation: number
  scale: number
}

/** Reject a candidate closer than this to an already-accepted pine. The test
 *  suite asserts a spacing greater than 3.0 m; 3.5 leaves headroom so the
 *  assertion never trips on a near-miss from floating point. */
const MIN_SPACING = 3.5
/** Attempts are capped at `count * MAX_ATTEMPTS_PER_TREE` so a small or
 *  steep island — or a caller asking for more pines than the rock has room
 *  for — terminates instead of hunting forever for a slot that no longer
 *  exists. */
const MAX_ATTEMPTS_PER_TREE = 40
/** Steeper than this and a pine cannot root. */
const MAX_SLOPE = 0.6
/**
 * Height above sea level below which nothing grows: the splash zone.
 *
 * An absolute band in metres, not a fraction of the island's height, because
 * that is what sets it in reality — how far spray and winter ice reach up the
 * rock depends on the sea, not on how tall the land behind it happens to be.
 * As a fraction it was 0.3, which on the 13 m mid island kept every tree above
 * 3.9 m and left a wide bare apron round the shore that read as a sand beach
 * rather than as granite. Inner-archipelago pines come very nearly down to the
 * waterline.
 */
const SHORE_BAND_M = 1.2

/** Weighted pick among the three pine variants. Stunted pines are biased
 *  toward low, exposed ground so the treeline reads as denser, taller forest
 *  inland and gnarled scrub near the shore, rather than a uniform mix. */
function pickKind(rng: () => number, heightFraction: number): PropKind {
  const stuntedWeight = 0.15 + 0.5 * (1 - heightFraction)
  if (rng() < stuntedWeight) return 'pine_stunted'
  return rng() < 0.5 ? 'pine_a' : 'pine_b'
}

/**
 * Rejection-sample `count` pines onto `surface`, refusing candidates that
 * are off the footprint, too close to the shore, too steep, or too close to
 * a pine already placed. Pure and deterministic for a given seed — see
 * `noise.ts` on why the archipelago cannot touch `Math.random`.
 */
export function scatterPines(
  surface: IslandSurface,
  def: IslandDef,
  count: number,
  seed: number,
): Placement[] {
  const rng = makeRng(seed)
  const placements: Placement[] = []
  const maxAttempts = count * MAX_ATTEMPTS_PER_TREE
  const cos = Math.cos(def.rotation)
  const sin = Math.sin(def.rotation)

  let attempts = 0
  while (placements.length < count && attempts < maxAttempts) {
    attempts++

    // Uniform sampling inside the unit disc: sqrt(rng()) for the radius
    // avoids the centre-bunching a naive `r = rng()` would give.
    const theta = rng() * Math.PI * 2
    const r = Math.sqrt(rng())
    const u = Math.cos(theta) * r
    const v = Math.sin(theta) * r

    // Same local-to-world transform `island.ts` bakes into the geometry, so
    // a candidate here lands on the exact rock the mesh draws.
    const lx = u * def.a
    const lz = v * def.b
    const x = def.centre[0] + lx * cos - lz * sin
    const z = def.centre[1] + lx * sin + lz * cos

    const y = surface.sampleAt(x, z)
    if (y === null) continue
    if (y <= SHORE_BAND_M) continue
    if (surface.slopeAt(x, z) > MAX_SLOPE) continue

    let tooClose = false
    for (const p of placements) {
      const dx = p.position[0] - x
      const dz = p.position[2] - z
      if (Math.hypot(dx, dz) < MIN_SPACING) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    const heightFraction = Math.min(1, y / def.height)
    placements.push({
      kind: pickKind(rng, heightFraction),
      position: [x, y, z],
      rotation: rng() * Math.PI * 2,
      scale: 0.75 + rng() * (1.35 - 0.75),
    })
  }

  return placements
}

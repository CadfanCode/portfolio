import type { IslandDef, IslandSurface } from './island'
import { makeRng } from './noise'

/**
 * Every kit part `props.tsx` can instance, matching the named root objects in
 * `archipelago-kit.glb` exactly — see `blender/archipelago.py`. This array is
 * the single declaration; `PropKind` is derived from it below rather than
 * kept as a parallel union, so a name present in one but not the other can
 * never drift apart. A kind absent from the GLB entirely — a typo here, or a
 * kit rebuilt without a part — is caught by `scatter.test.ts` cross-checking
 * this list against the file itself, since a TypeScript-only guard cannot see
 * inside a binary asset.
 */
export const PROP_KINDS = [
  'birch',
  'boathouse_red',
  'boulder_a',
  'boulder_b',
  'dinghy',
  'flagpole',
  'house_red',
  'house_red_b',
  'jetty',
  'juniper',
  'pine_a',
  'pine_b',
  'pine_stunted',
  'rock_stack',
  'sauna_red',
  'sea_mark',
] as const

export type PropKind = (typeof PROP_KINDS)[number]

/** One instance of a kit part, ready to compose into an instance matrix. */
export type Placement = {
  kind: PropKind
  /** World position, y already snapped to the island surface. */
  position: [number, number, number]
  /** Rotation about Y, radians. */
  rotation: number
  scale: number
}

/** One weighted kit variant a layer can produce. */
export type ScatterKind = {
  kind: PropKind
  weight: number
  /** Weight used at the shoreline instead of `weight`; lerped toward `weight`
   *  with height. Omit to use `weight` everywhere — a flat mix that does not
   *  care how far up the rock a candidate landed. */
  lowGroundWeight?: number
}

/** One rejection-sampled layer of dressing on an island. `layout.ts` authors
 *  these; `scatterLayer` only knows how to run one. */
export type ScatterLayer = {
  kinds: ScatterKind[]
  count: number
  seed: number
  minSpacing: number
  /** Height band above sea level this layer may occupy, metres. */
  minHeight: number
  maxHeight: number
  maxSlope: number
  scaleRange: [number, number]
}

/** Attempts are capped at `count * MAX_ATTEMPTS_PER_PROP` so a small or steep
 *  island — or a caller asking for more props than the rock has room for —
 *  terminates instead of hunting forever for a slot that no longer exists. */
const MAX_ATTEMPTS_PER_PROP = 40

/**
 * Weighted pick among a layer's kit variants. `heightFraction` biases the
 * draw toward `lowGroundWeight` near the shore and `weight` toward the
 * summit, the same lerp for every kind in the layer, so e.g. a layer mixing
 * pines and birch can lean stunted pine low and tall pine high with a single
 * shared height signal rather than a bespoke rule per kind.
 */
function pickKind(rng: () => number, kinds: ScatterKind[], heightFraction: number): PropKind {
  const weights = kinds.map((k) => {
    const low = k.lowGroundWeight ?? k.weight
    return low + (k.weight - low) * heightFraction
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = rng() * total
  for (let i = 0; i < kinds.length; i++) {
    r -= weights[i]
    if (r <= 0) return kinds[i].kind
  }
  // Floating-point round-off can leave `r` fractionally positive after the
  // last subtraction; fall back to the last kind rather than undefined.
  return kinds[kinds.length - 1].kind
}

/**
 * Rejection-sample `layer.count` props onto `surface`, refusing candidates
 * that are off the footprint, outside the layer's height band, too steep, or
 * too close to a prop already placed in this layer or in `avoid`. Pure and
 * deterministic for a given seed — see `noise.ts` on why the archipelago
 * cannot touch `Math.random`.
 *
 * `avoid` is how layers stack without interpenetrating: pass a previous
 * layer's output (or a set of authored buildings) and this one will refuse to
 * grow through it. Layers are otherwise independent — nothing here reads
 * another layer's kinds or height band.
 */
export function scatterLayer(
  surface: IslandSurface,
  def: IslandDef,
  layer: ScatterLayer,
  avoid: readonly Placement[] = [],
): Placement[] {
  const rng = makeRng(layer.seed)
  const placements: Placement[] = []
  const maxAttempts = layer.count * MAX_ATTEMPTS_PER_PROP
  const cos = Math.cos(def.rotation)
  const sin = Math.sin(def.rotation)
  const [minScale, maxScale] = layer.scaleRange

  let attempts = 0
  while (placements.length < layer.count && attempts < maxAttempts) {
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
    if (y < layer.minHeight || y > layer.maxHeight) continue
    if (surface.slopeAt(x, z) > layer.maxSlope) continue

    let tooClose = false
    for (const p of placements) {
      if (Math.hypot(p.position[0] - x, p.position[2] - z) < layer.minSpacing) {
        tooClose = true
        break
      }
    }
    if (!tooClose) {
      for (const p of avoid) {
        if (Math.hypot(p.position[0] - x, p.position[2] - z) < layer.minSpacing) {
          tooClose = true
          break
        }
      }
    }
    if (tooClose) continue

    const heightFraction = Math.min(1, y / def.height)
    placements.push({
      kind: pickKind(rng, layer.kinds, heightFraction),
      position: [x, y, z],
      rotation: rng() * Math.PI * 2,
      scale: minScale + rng() * (maxScale - minScale),
    })
  }

  return placements
}

import { BufferAttribute, BufferGeometry, Color } from 'three'
import { smoothstep } from '../mathUtils'
import { fbm2D, valueNoise2D } from './noise'

/** How far out an island is meant to be seen from. Distant skerries get fewer
 *  segments and can drop detail the camera will never resolve anyway. */
export type IslandTier = 'near' | 'mid' | 'far'

/** Authored placement and shape of one island. Everything about its geometry
 *  is derived from this plus a segment count, so the same definition always
 *  produces the same rock — see `noise.ts` on why that determinism matters. */
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

/** Local footprint radius past which the mesh is underwater skirt rather than
 *  rock. The skirt exists so no gap can ever show between island and water,
 *  however the waves move. */
const SKIRT_R = 1.15
/** How far below sea level the skirt drops by the time it reaches `SKIRT_R`. */
const SKIRT_DEPTH = -1.5

/** Rock tone before the granite texture and its tint bands are applied. */
const ROCK_COLOR = new Color(0.55, 0.52, 0.47)
/** Wet-rock tone blended in near the waterline. */
const WET_COLOR = new Color(0.26, 0.28, 0.29)
/** Lichen tint blended in high on the rock, above the wet band. */
const LICHEN_COLOR = new Color(0.44, 0.53, 0.34)

/**
 * Height at a local `(u, v)` — the unit-disc coordinates in which the island's
 * footprint sits exactly at `r = 1`. Shared by the geometry builder and
 * `sampleAt` so the two can never disagree: see the module doc on why that
 * matters for props sitting on the rock.
 */
function heightAt(u: number, v: number, def: IslandDef): number {
  const r = Math.hypot(u, v)

  if (r > 1) {
    // Underwater skirt: ramps linearly from the shoreline down to
    // SKIRT_DEPTH by SKIRT_R, then stays flat past that.
    const t = Math.min(1, (r - 1) / (SKIRT_R - 1))
    return SKIRT_DEPTH * t
  }

  // `smoothstep(1.0, 0.55, r)` is 0 exactly at r = 1 (the shoreline) and 1 by
  // r = 0.55, giving a flat-ish summit plateau with a shaped slope down to
  // the water. Everything below is multiplied by this mask (or a power of
  // it), which is what guarantees the shoreline evaluates to exactly 0 — not
  // just close to 0 — even though the fine noise term is not itself zero
  // there.
  const mask = smoothstep(1.0, 0.55, r)
  const shoreMask = Math.pow(mask, 1.4)

  const ridge = 0.65 + 0.35 * (fbm2D(u * 2.5, v * 2.5, def.seed, 2) * 0.5 + 0.5)
  const fine = valueNoise2D(u * 9.0, v * 9.0, def.seed + 1)

  return def.height * shoreMask * ridge + def.height * 0.12 * fine * mask
}

/** Invert the island's world placement back to local unit-disc `(u, v)`. */
function worldToLocal(x: number, z: number, def: IslandDef): [number, number] {
  const dx = x - def.centre[0]
  const dz = z - def.centre[1]
  const cos = Math.cos(def.rotation)
  const sin = Math.sin(def.rotation)
  // Rotation matrices are orthogonal, so the inverse rotation is just the
  // transpose of the forward one used when baking the geometry below.
  const ua = dx * cos + dz * sin
  const vb = -dx * sin + dz * cos
  return [ua / def.a, vb / def.b]
}

export function buildIsland(def: IslandDef, segments: number): IslandSurface {
  const res = segments + 1
  const positions = new Float32Array(res * res * 3)
  const colors = new Float32Array(res * res * 3)
  const cos = Math.cos(def.rotation)
  const sin = Math.sin(def.rotation)
  const tmpColor = new Color()

  let p = 0
  for (let iz = 0; iz < res; iz++) {
    const v = -SKIRT_R + (2 * SKIRT_R * iz) / segments
    for (let ix = 0; ix < res; ix++) {
      const u = -SKIRT_R + (2 * SKIRT_R * ix) / segments
      const y = heightAt(u, v, def)

      // Local metre offsets before rotation, then rotate about Y and
      // translate — the same forward transform `worldToLocal` inverts.
      const lx = u * def.a
      const lz = v * def.b
      const x = def.centre[0] + lx * cos - lz * sin
      const z = def.centre[1] + lx * sin + lz * cos

      positions[p] = x
      positions[p + 1] = y
      positions[p + 2] = z

      tmpColor.copy(ROCK_COLOR)
      if (Math.abs(y) < 0.8) {
        tmpColor.lerp(WET_COLOR, 1 - Math.abs(y) / 0.8)
      }
      if (y > def.height * 0.6) {
        const t = Math.min(1, (y - def.height * 0.6) / (def.height * 0.4))
        tmpColor.lerp(LICHEN_COLOR, t)
      }
      colors[p] = tmpColor.r
      colors[p + 1] = tmpColor.g
      colors[p + 2] = tmpColor.b

      p += 3
    }
  }

  const indices: number[] = []
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * res + ix
      const b = a + 1
      const c = a + res
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const sampleAt = (x: number, z: number): number | null => {
    const [u, v] = worldToLocal(x, z, def)
    // A point exactly on the boundary can land a hair over r = 1 from
    // floating-point round-trip error through the rotation; tolerate that
    // rather than reporting the shoreline itself as outside the footprint.
    if (Math.hypot(u, v) > 1 + 1e-9) return null
    return heightAt(u, v, def)
  }

  const slopeAt = (x: number, z: number): number => {
    const [u, v] = worldToLocal(x, z, def)
    const eps = 0.01
    const h0 = heightAt(u, v, def)
    const hu = heightAt(u + eps, v, def)
    const hv = heightAt(u, v + eps, def)
    // Convert the local-space finite difference to a world-space slope
    // (rise over run) by undoing the per-axis (a, b) scale baked into u, v.
    const gx = (hu - h0) / eps / def.a
    const gz = (hv - h0) / eps / def.b
    return Math.min(1, Math.hypot(gx, gz))
  }

  return { geometry, sampleAt, slopeAt }
}

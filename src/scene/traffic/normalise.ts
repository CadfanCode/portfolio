// None of the five poly.pizza vessel GLBs carries a verified real-world scale
// or a guaranteed up-axis and forward direction, so nothing here trusts them.
// Every model is measured off its own geometry instead and normalised against
// the length the fleet table asks for and the project's own bow convention.

import { Box3, MathUtils, Object3D, Vector3 } from 'three'

/** What a raw model needs to sit correctly in the traffic lanes: a uniform
 *  scale that makes its longest horizontal dimension match `lengthM`, and a
 *  yaw that turns that axis to point along -Z, the bow direction every other
 *  moving thing in the scene (the boat, the camera path) already uses. */
export type Normalisation = { scale: number; yaw: number }

// Scratch, reused across calls so measuring a class's model never allocates
// beyond the one Box3 three.js itself needs to walk the geometry.
const box = new Box3()
const size = new Vector3()

/**
 * Measure `object`'s bounding box and return the scale and yaw that would
 * bring its longest horizontal dimension to `lengthM`, pointed along -Z.
 *
 * The "longest horizontal dimension" heuristic is doing the up-axis guess as
 * well as the length one: a boat hull is always longer than it is beam-wide,
 * so whichever horizontal axis the box is longest along is the hull's own
 * length axis, regardless of which way the model happened to be authored
 * facing. Height (Y) is deliberately excluded from that comparison — a tall
 * mast on a short hull must not be mistaken for the vessel's length.
 */
export function measureAndNormalise(object: Object3D, lengthM: number): Normalisation {
  box.setFromObject(object)
  box.getSize(size)

  // Compare only the horizontal extents; whichever is larger is the hull's
  // long axis, and the model is assumed already Y-up like every other GLB
  // this project loads (see Boat.tsx, Parrot.tsx — none of the pipeline
  // re-derives an up-axis, so poly.pizza's own Y-up export is trusted here).
  const alongX = size.x >= size.z
  const longAxis = alongX ? size.x : size.z
  const scale = longAxis > 1e-6 ? lengthM / longAxis : 1

  // Yaw needed to swing the long axis onto -Z. A model already built along Z
  // needs no rotation; one built along X needs a quarter turn — three.js's Y
  // rotation convention (x' = cos*x + sin*z, z' = -sin*x + cos*z) puts +90
  // degrees of yaw on a +X vector at (0, 0, -1), i.e. -Z.
  //
  // Which of +X/-X or +Z/-Z the hull's bow actually points at is not
  // recoverable from a bounding box alone — a hull is not symmetric about its
  // own centre, but nothing here reads which end carries more geometry, since
  // the five poly.pizza vessels all happen to be authored close enough to
  // bow-first. If a future model lands stern-first, this is the one place to
  // add a per-model 180-degree correction rather than special-casing the
  // renderer.
  const yaw = alongX ? MathUtils.degToRad(90) : 0

  return { scale, yaw }
}

/**
 * `measureAndNormalise`, memoised per model URL.
 *
 * `useGLTF` returns the same cached scene graph for every vessel of a class,
 * so measuring it is a once-per-class cost, not a once-per-vessel one — but
 * `Traffic.tsx` mounts and unmounts a component per vessel as they spawn and
 * despawn, so without this cache the same box would be re-measured every time
 * a new instance of a common class (e.g. `sail_a`) appears.
 */
const cache = new Map<string, Normalisation>()

export function normaliseModel(url: string, object: Object3D, lengthM: number): Normalisation {
  const cached = cache.get(url)
  if (cached) return cached
  const result = measureAndNormalise(object, lengthM)
  cache.set(url, result)
  return result
}

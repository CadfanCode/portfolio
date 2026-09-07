// None of the five poly.pizza vessel GLBs carries a verified real-world scale
// or a guaranteed up-axis and forward direction, so nothing here trusts them.
// Every model is measured off its own geometry instead and normalised against
// the length the fleet table asks for and the project's own bow convention.

import { Box3, MathUtils, Mesh, Object3D, Vector3 } from 'three'

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
  // Which END of that axis is the bow is a separate question, and a bounding
  // box cannot answer it: a box is symmetric, a hull is not. It was originally
  // assumed the models were all authored bow-first. Measuring them says
  // otherwise — sailboat A, sailboat B and the ferry all point the wrong way,
  // three of the five, and a vessel that sails stern-first up its lane is
  // exactly the kind of thing that looks wrong long before anyone can say why.
  const bowAtNegative = bowIsAtNegativeEnd(object, alongX)
  const yaw = alongX
    ? MathUtils.degToRad(bowAtNegative ? -90 : 90)
    : bowAtNegative
      ? 0
      : Math.PI

  return { scale, yaw }
}

/** Fraction of the hull length at each end used to compare widths. */
const END_SAMPLE = 0.4

/**
 * Which end of the hull's long axis is the bow, measured rather than assumed.
 *
 * A bow is narrower than a stern. So: take the vertices in the outer
 * `END_SAMPLE` of each end, and compare their mean distance from the hull's
 * centreline. The narrower end is the bow.
 *
 * Only geometry below the model's mid-height is counted. Masts, funnels and
 * superstructure sit high and are not part of the hull's plan shape — on a
 * sailboat the rig alone would otherwise dominate the sample and the answer
 * would be noise.
 */
function bowIsAtNegativeEnd(object: Object3D, alongX: boolean): boolean {
  object.updateWorldMatrix(true, true)
  box.setFromObject(object)
  box.getSize(size)
  const centre = box.getCenter(new Vector3())
  const halfLength = (alongX ? size.x : size.z) / 2
  if (halfLength < 1e-6) return true

  let negSum = 0
  let negCount = 0
  let posSum = 0
  let posCount = 0
  const vertex = new Vector3()

  object.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const position = mesh.geometry?.getAttribute('position')
    if (!position) return
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      // Hull only — everything above the midline is rig and superstructure.
      if (vertex.y > centre.y) continue
      const along = ((alongX ? vertex.x : vertex.z) - (alongX ? centre.x : centre.z)) / halfLength
      const offCentre = Math.abs((alongX ? vertex.z : vertex.x) - (alongX ? centre.z : centre.x))
      if (along < -1 + END_SAMPLE) {
        negSum += offCentre
        negCount++
      } else if (along > 1 - END_SAMPLE) {
        posSum += offCentre
        posCount++
      }
    }
  })

  // With nothing to compare, keep the previous behaviour rather than guessing.
  if (negCount === 0 || posCount === 0) return true
  return negSum / negCount <= posSum / posCount
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

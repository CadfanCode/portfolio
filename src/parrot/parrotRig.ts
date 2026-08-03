import {
  Bone,
  Float32BufferAttribute,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three'
import type { CanvasTexture, Mesh, MeshStandardMaterial } from 'three'
import { recolorPlumageGreen } from './parrotTexture'

/** Clamped smoothstep, matching the reference posing math exactly — the
 *  spec's weight formulas were tuned against this definition, not the
 *  unclamped `t*t*(3-2t)` some call sites elsewhere use. */
function ss(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Neck pivot, in the model's own (untranslated) coordinates, and the axis
 *  the head/tail split is measured along — see `h` below. Tuned offline
 *  against the actual mesh; keep as given. */
const NECK_PIVOT: readonly [number, number, number] = [0, 20, 28]
const HEAD_AXIS: readonly [number, number, number] = [0, 0.55, 0.835]
const HEAD_BAND: readonly [number, number] = [-6, 18]

const SHOULDER_X = 10
const SHOULDER_Y = 6
const SHOULDER_Z = 14
const WING_X: readonly [number, number] = [9, 18]
const WING_Y: readonly [number, number, number, number] = [-48, -38, 10, 22]
const WING_Z: readonly [number, number, number, number] = [-26, -12, 42, 52]

const TAIL_PIVOT: readonly [number, number, number] = [0, -30, -20]
const TAIL_Z: readonly [number, number] = [-16, -44]

/** Feet sit at model y = -55.86 in the source mesh; translating the geometry
 *  by this amount puts them at y = 0 so the component can place the bird by
 *  its feet, the way a perch position naturally wants to be authored. */
const FEET_OFFSET = 55.86

const BODY = 0
const HEAD = 1
const WING_L = 2
const WING_R = 3
const TAIL = 4

export type ParrotBones = {
  body: Bone
  head: Bone
  wingL: Bone
  wingR: Bone
  tail: Bone
}

export type ParrotSkin = {
  skinned: SkinnedMesh
  bones: ParrotBones
  /** The recoloured plumage texture, or `null` if the source mesh had no
   *  map to recolour. Owned by this skin, not the `useGLTF` cache — the
   *  caller must dispose it on unmount. */
  plumageTexture: CanvasTexture | null
}

/**
 * Builds a five-bone skeleton and per-vertex skin weights for the source
 * parrot mesh, entirely at load time — the GLB ships with neither an
 * animation nor a skin, both of which this rig adds procedurally from the
 * rest pose. See `Parrot.tsx`'s doc for why: at 45 kB and 651 triangles the
 * model is worth using, but its only asset is a bind-less mesh, so the
 * skeleton this component's animation drives has to come from somewhere.
 */
export function buildParrotSkin(sourceMesh: Mesh): ParrotSkin {
  const geometry = sourceMesh.geometry.clone()
  const position = geometry.attributes.position
  const vertexCount = position.count

  const skinIndex = new Uint16Array(vertexCount * 4)
  const skinWeight = new Float32Array(vertexCount * 4)

  for (let i = 0; i < vertexCount; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)

    const h = (y - NECK_PIVOT[1]) * HEAD_AXIS[1] + (z - NECK_PIVOT[2]) * HEAD_AXIS[2]
    const wHead = ss(HEAD_BAND[0], HEAD_BAND[1], h)
    const wTail = ss(TAIL_Z[0], TAIL_Z[1], z) * (1 - wHead)
    const wWing =
      ss(WING_X[0], WING_X[1], Math.abs(x)) *
      ss(WING_Y[0], WING_Y[1], y) *
      (1 - ss(WING_Y[2], WING_Y[3], y)) *
      ss(WING_Z[0], WING_Z[1], z) *
      (1 - ss(WING_Z[2], WING_Z[3], z)) *
      (1 - wHead) *
      (1 - wTail)
    const wBody = Math.max(0, 1 - wHead - wTail - wWing)

    const wingLeft = x < 0 ? wWing : 0
    const wingRight = x < 0 ? 0 : wWing

    const base = i * 4
    skinIndex[base + 0] = BODY
    skinIndex[base + 1] = HEAD
    skinIndex[base + 2] = x < 0 ? WING_L : WING_R
    skinIndex[base + 3] = TAIL
    skinWeight[base + 0] = wBody
    skinWeight[base + 1] = wHead
    skinWeight[base + 2] = x < 0 ? wingLeft : wingRight
    skinWeight[base + 3] = wTail
  }

  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4))

  // Feet to origin — after this, the pivots below are authored in the same
  // translated space the geometry now lives in.
  geometry.translate(0, FEET_OFFSET, 0)

  // The source primitive carries exactly one material (verified against the
  // GLB — one node, one mesh, one primitive), never an array.
  const sourceMaterial = Array.isArray(sourceMesh.material)
    ? sourceMesh.material[0]
    : sourceMesh.material
  const material = sourceMaterial.clone()
  // The GLB's plumage is red; Polly is recoloured to green at load time by
  // repainting the (cloned, never the cached) material's texture — see
  // `parrotTexture.ts` for the hue-band selection and why it isn't a literal
  // colour swap.
  const plumageTexture = recolorPlumageGreen(material as MeshStandardMaterial)

  const body = new Bone()
  body.position.set(0, 0, 0)

  const head = new Bone()
  head.position.set(NECK_PIVOT[0], NECK_PIVOT[1] + FEET_OFFSET, NECK_PIVOT[2])
  body.add(head)

  const wingL = new Bone()
  wingL.position.set(-SHOULDER_X, SHOULDER_Y + FEET_OFFSET, SHOULDER_Z)
  body.add(wingL)

  const wingR = new Bone()
  wingR.position.set(SHOULDER_X, SHOULDER_Y + FEET_OFFSET, SHOULDER_Z)
  body.add(wingR)

  const tail = new Bone()
  tail.position.set(TAIL_PIVOT[0], TAIL_PIVOT[1] + FEET_OFFSET, TAIL_PIVOT[2])
  body.add(tail)

  const skinned = new SkinnedMesh(geometry, material)
  skinned.add(body)
  // A freshly constructed Bone has `position` set but `matrixWorld` still at
  // identity until something propagates it. `Skeleton`'s constructor reads
  // `bone.matrixWorld` to compute each bind inverse, so without this call it
  // would capture identity inverses for every bone and silently lose the
  // pivots above — the rig would look right at rest and deform nonsensically
  // the moment anything rotated. This is load-bearing, not redundant.
  skinned.updateMatrixWorld(true)
  skinned.bind(new Skeleton([body, head, wingL, wingR, tail]))
  skinned.castShadow = true
  // Skinning can push vertices past the rest-pose bounding sphere frustum
  // culling would otherwise compute from; this is a single 651-triangle
  // mesh, so the cost of never culling it is negligible next to the risk of
  // it popping out of view mid-flap.
  skinned.frustumCulled = false

  return {
    skinned,
    bones: { body, head, wingL, wingR, tail },
    plumageTexture,
  }
}

import { Matrix4 } from 'three'
import type { BufferGeometry, Material, Mesh, Object3D } from 'three'

/**
 * One drawable part of a kit node, with its transform relative to the node's
 * root rather than to the scene. `archipelago-kit.glb` imports a part with a
 * single material as a bare `Mesh`, but GLTFLoader splits any part with more
 * than one material — every house, both boathouse variants, the flagpole,
 * and all three pine kinds — into a `Group` of one `Mesh` per primitive.
 * `props.tsx` needs one `InstancedMesh` per primitive, so it works from a
 * flat list of parts rather than assuming `nodes[kind]` is itself a mesh.
 */
export type KitPart = {
  geometry: BufferGeometry
  material: Material | Material[]
  /** This part's transform relative to the kit node's root, so a primitive
   *  carrying its own local offset (e.g. a roof set above a house's origin)
   *  still lands in the right place once composed with a placement matrix. */
  offset: Matrix4
}

/**
 * Flattens `root` into one `KitPart` per descendant mesh, `root` itself
 * included if it is a mesh. Returns `[]` for a root with no meshes at all —
 * a typo'd `PropKind` or a kit rebuilt without some part — so the caller can
 * skip it instead of instancing an empty geometry that silently draws
 * nothing (see `Props` in `props.tsx`).
 */
export function collectKitParts(root: Object3D): KitPart[] {
  root.updateWorldMatrix(true, true)

  const rootInverse = new Matrix4().copy(root.matrixWorld).invert()
  const parts: KitPart[] = []

  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return

    const offset = new Matrix4().copy(rootInverse).multiply(mesh.matrixWorld)
    parts.push({ geometry: mesh.geometry, material: mesh.material, offset })
  })

  return parts
}

import { describe, expect, it } from 'vitest'
import { BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { collectKitParts } from './kit'

function leaf() {
  return new Mesh(new BufferGeometry(), new MeshBasicMaterial())
}

describe('collectKitParts', () => {
  it('returns one part with an identity offset for a bare mesh root', () => {
    const mesh = leaf()
    const [part, ...rest] = collectKitParts(mesh)

    expect(rest).toHaveLength(0)
    expect(part.geometry).toBe(mesh.geometry)
    expect(part.material).toBe(mesh.material)
    expect(part.offset.elements).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ])
  })

  it('returns one part per child mesh, in traversal order', () => {
    const group = new Group()
    const a = leaf()
    const b = leaf()
    group.add(a, b)

    const parts = collectKitParts(group)

    expect(parts).toHaveLength(2)
    expect(parts[0].geometry).toBe(a.geometry)
    expect(parts[1].geometry).toBe(b.geometry)
  })

  it('bakes a child mesh\'s local position and rotation into its offset', () => {
    const group = new Group()
    const child = leaf()
    child.position.set(1, 2, 3)
    child.rotation.set(0, Math.PI / 2, 0)
    group.add(child)

    const [part] = collectKitParts(group)

    child.updateMatrix()
    expect(part.offset.elements).toEqual(child.matrix.elements)
  })

  it('returns an empty list for a group with no meshes', () => {
    const group = new Group()
    group.add(new Group())

    expect(collectKitParts(group)).toEqual([])
  })
})

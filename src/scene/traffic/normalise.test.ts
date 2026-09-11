import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { FLEET } from './fleet'
import { measureAndNormalise } from './normalise'

/**
 * A hull-shaped point cloud: narrow at one end, wide at the other, with a tall
 * thin mast on top. The mast is the trap — it is the tallest thing in the box
 * and sits on the centreline, so any bow test that samples the whole model
 * rather than just the hull gets swamped by it.
 *
 * `bowAt` says which end of Z the narrow end is placed at.
 */
function makeHull(bowAt: -1 | 1, lengthZ = 10): Mesh {
  const pts: number[] = []
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = i / steps // 0 at the bow end, 1 at the stern end
    const z = bowAt * (-lengthZ / 2 + t * lengthZ) * -1
    const halfBeam = 0.15 + t * 1.85
    for (const sx of [-1, 1]) {
      for (const y of [0, 0.5, 1]) pts.push(sx * halfBeam, y, z)
    }
  }
  // The mast: tall, central, and irrelevant to the hull's plan shape.
  for (let i = 0; i <= 10; i++) pts.push(0, 1 + i * 0.6, 0)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
  return new Mesh(geometry, new MeshBasicMaterial())
}

describe('measureAndNormalise', () => {
  it('scales the longest horizontal dimension to the requested length', () => {
    expect(measureAndNormalise(makeHull(-1, 10), 8).scale).toBeCloseTo(0.8, 6)
  })

  it('ignores a tall mast when deciding which axis is the length', () => {
    // The mast reaches y = 7 on a 10 m hull. If height were compared against
    // the horizontal extents, the mast would win and the scale would be wrong.
    expect(measureAndNormalise(makeHull(-1, 10), 10).scale).toBeCloseTo(1, 6)
  })

  it('leaves a bow-at--Z model unrotated', () => {
    expect(measureAndNormalise(makeHull(-1), 8).yaw).toBeCloseTo(0, 6)
  })

  it('turns a stern-first model through 180 degrees', () => {
    // Three of the five real vessel models are authored this way. Without this
    // they sail backwards up their lanes.
    expect(Math.abs(measureAndNormalise(makeHull(1), 8).yaw)).toBeCloseTo(Math.PI, 6)
  })

  it('points the bow along -Z whichever way the model was authored', () => {
    for (const bowAt of [-1, 1] as const) {
      const { yaw } = measureAndNormalise(makeHull(bowAt), 8)
      // Rotating the model's own bow direction by yaw must land on -Z.
      const bowLocal = { x: 0, z: bowAt === -1 ? -1 : 1 }
      const x = bowLocal.x * Math.cos(yaw) + bowLocal.z * Math.sin(yaw)
      const z = -bowLocal.x * Math.sin(yaw) + bowLocal.z * Math.cos(yaw)
      expect(x).toBeCloseTo(0, 6)
      expect(z).toBeCloseTo(-1, 6)
    }
  })

  describe('draftM', () => {
    // A plain 2x1x4 box, origin at its own bottom corner — the shape of the
    // waterline calculation doesn't matter here since the fraction is
    // authored, only that it is applied against the model's own measured
    // bbox height and scale rather than a fixed number of metres.
    function makeBox(): Mesh {
      const pts: number[] = []
      for (const x of [-1, 1]) {
        for (const y of [0, 1]) {
          for (const z of [-2, 2]) pts.push(x, y, z)
        }
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
      return new Mesh(geometry, new MeshBasicMaterial())
    }

    it('defaults to 0 draft when no waterline fraction is given', () => {
      expect(measureAndNormalise(makeBox(), 4).draftM).toBe(0)
    })

    it('scales the draft with the fraction, the bbox height and the model scale', () => {
      // lengthM 4 on a 4 m-long box (z spans -2..2) gives scale 1, so draftM
      // should equal waterlineFrac * bbox height directly: 0.25 * 1 = 0.25.
      expect(measureAndNormalise(makeBox(), 4, 0.25).draftM).toBeCloseTo(0.25, 6)
    })

    it('scales with model scale, not just the fraction', () => {
      // lengthM 8 on the same box doubles the scale to 2, so the same
      // fraction of the same 1 m bbox height should double the draft too.
      expect(measureAndNormalise(makeBox(), 8, 0.25).draftM).toBeCloseTo(0.5, 6)
    })

    it('returns 0 draft for zero-height geometry rather than NaN', () => {
      const geometry = new BufferGeometry()
      geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([-1, 0, -2, 1, 0, -2, -1, 0, 2, 1, 0, 2]), 3),
      )
      const flat = new Mesh(geometry, new MeshBasicMaterial())
      expect(measureAndNormalise(flat, 4, 0.25).draftM).toBe(0)
    })

    it('returns 0 draft for empty geometry rather than NaN', () => {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
      const empty = new Mesh(geometry, new MeshBasicMaterial())
      expect(measureAndNormalise(empty, 4, 0.25).draftM).toBe(0)
    })
  })

  describe('FLEET.waterlineFrac', () => {
    // Authored, not derived — so nothing here catches a typo except a sanity
    // bound. A fraction at or above 0.5 would sink more than half the
    // model's own bbox height, which no vessel in this fleet should ever do.
    it.each(FLEET.map((c) => [c.id, c.waterlineFrac] as const))(
      '%s has a waterlineFrac within [0, 0.5)',
      (_id, waterlineFrac) => {
        expect(waterlineFrac).toBeGreaterThanOrEqual(0)
        expect(waterlineFrac).toBeLessThan(0.5)
      },
    )
  })
})

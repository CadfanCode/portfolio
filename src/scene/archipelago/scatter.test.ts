import { describe, expect, it } from 'vitest'
import { buildIsland, type IslandDef } from './island'
import { scatterPines } from './scatter'

const DEF: IslandDef = {
  id: 'test', tier: 'mid', centre: [0, 0],
  a: 60, b: 40, rotation: 0, height: 12, seed: 42,
}
const SURFACE = buildIsland(DEF, 64)

describe('scatterPines', () => {
  it('is deterministic for a seed', () => {
    const a = scatterPines(SURFACE, DEF, 40, 7)
    const b = scatterPines(SURFACE, DEF, 40, 7)
    expect(a).toEqual(b)
  })

  it('places every pine on the island surface, not floating or buried', () => {
    for (const p of scatterPines(SURFACE, DEF, 60, 3)) {
      const y = SURFACE.sampleAt(p.position[0], p.position[2])
      expect(y).not.toBeNull()
      expect(Math.abs(p.position[1] - (y as number))).toBeLessThan(0.01)
    }
  })

  it('keeps pines off the bare shore zone', () => {
    // Trees do not grow in the splash zone. That band is absolute — set by how
    // far spray and winter ice reach up the rock — not a fraction of the
    // island's height, so this asserts metres above sea level rather than a
    // proportion. As a proportion it kept every tree above 3.9 m on the mid
    // island and left a bare apron that read as a beach.
    for (const p of scatterPines(SURFACE, DEF, 60, 3)) {
      expect(p.position[1]).toBeGreaterThan(1.0)
    }
  })

  it('respects a minimum spacing', () => {
    const ps = scatterPines(SURFACE, DEF, 60, 3)
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].position[0] - ps[j].position[0]
        const dz = ps[i].position[2] - ps[j].position[2]
        expect(Math.hypot(dx, dz)).toBeGreaterThan(3.0)
      }
    }
  })

  it('never returns more than asked for', () => {
    expect(scatterPines(SURFACE, DEF, 25, 5).length).toBeLessThanOrEqual(25)
  })

  it('returns nothing when asked for nothing', () => {
    expect(scatterPines(SURFACE, DEF, 0, 5)).toEqual([])
  })

  it('varies scale and rotation so the treeline is not uniform', () => {
    const ps = scatterPines(SURFACE, DEF, 40, 9)
    expect(new Set(ps.map((p) => p.scale)).size).toBeGreaterThan(5)
    expect(new Set(ps.map((p) => p.rotation)).size).toBeGreaterThan(5)
  })

  it('mixes the pine variants', () => {
    const kinds = new Set(scatterPines(SURFACE, DEF, 60, 9).map((p) => p.kind))
    expect(kinds.size).toBeGreaterThan(1)
  })
})

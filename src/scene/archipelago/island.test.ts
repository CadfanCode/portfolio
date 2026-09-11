import { describe, expect, it } from 'vitest'
import { buildIsland, type IslandDef } from './island'

const DEF: IslandDef = {
  id: 'test',
  tier: 'mid',
  centre: [100, -50],
  a: 60,
  b: 40,
  rotation: 0.3,
  height: 12,
  seed: 42,
}

describe('buildIsland', () => {
  it('is deterministic: the same definition gives byte-identical positions', () => {
    const one = buildIsland(DEF, 32).geometry.getAttribute('position').array
    const two = buildIsland(DEF, 32).geometry.getAttribute('position').array
    expect(Array.from(one)).toEqual(Array.from(two))
  })

  it('puts the shoreline at y = 0', () => {
    // Walk the footprint boundary. Every point on it must be at sea level,
    // or the island will either float above the water or be sliced by it.
    const s = buildIsland(DEF, 48)
    for (let i = 0; i < 32; i++) {
      const th = (i / 32) * Math.PI * 2
      const lx = Math.cos(th) * DEF.a
      const lz = Math.sin(th) * DEF.b
      const x = DEF.centre[0] + lx * Math.cos(DEF.rotation) - lz * Math.sin(DEF.rotation)
      const z = DEF.centre[1] + lx * Math.sin(DEF.rotation) + lz * Math.cos(DEF.rotation)
      const y = s.sampleAt(x, z)
      expect(y).not.toBeNull()
      expect(Math.abs(y as number)).toBeLessThan(0.05)
    }
  })

  it('is highest near the centre', () => {
    const s = buildIsland(DEF, 48)
    const centre = s.sampleAt(DEF.centre[0], DEF.centre[1]) as number
    const edge = s.sampleAt(DEF.centre[0] + DEF.a * 0.9, DEF.centre[1]) as number
    expect(centre).toBeGreaterThan(edge)
    expect(centre).toBeGreaterThan(DEF.height * 0.5)
    expect(centre).toBeLessThanOrEqual(DEF.height * 1.2)
  })

  it('returns null outside the footprint', () => {
    expect(buildIsland(DEF, 32).sampleAt(DEF.centre[0] + DEF.a * 3, DEF.centre[1])).toBeNull()
  })

  it('never rises above the stated height, allowing for the noise band', () => {
    const g = buildIsland(DEF, 48).geometry
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeLessThanOrEqual(DEF.height * 1.2)
      expect(pos.getY(i)).toBeGreaterThanOrEqual(-1.6)
    }
  })

  it('carries a skirt below the waterline so no gap can show', () => {
    const g = buildIsland(DEF, 48).geometry
    const pos = g.getAttribute('position')
    let below = 0
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.5) below++
    expect(below).toBeGreaterThan(0)
  })

  it('scales vertex count with the segment parameter', () => {
    const small = buildIsland(DEF, 16).geometry.getAttribute('position').count
    const large = buildIsland(DEF, 32).geometry.getAttribute('position').count
    expect(large).toBeGreaterThan(small)
  })

  it('reports slope as 0..1 and steeper at the shore than the summit', () => {
    const s = buildIsland(DEF, 48)
    const summit = s.slopeAt(DEF.centre[0], DEF.centre[1])
    const shore = s.slopeAt(DEF.centre[0] + DEF.a * 0.95, DEF.centre[1])
    expect(summit).toBeGreaterThanOrEqual(0)
    expect(summit).toBeLessThanOrEqual(1)
    expect(shore).toBeGreaterThan(summit)
  })

  it('writes a vertex colour attribute for the wet band and lichen', () => {
    const g = buildIsland(DEF, 32).geometry
    expect(g.getAttribute('color')).toBeDefined()
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
  })
})

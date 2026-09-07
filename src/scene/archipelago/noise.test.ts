import { describe, expect, it } from 'vitest'
import { fbm2D, makeRng, valueNoise2D } from './noise'

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(1234)
    const b = makeRng(1234)
    const one = [a(), a(), a(), a()]
    const two = [b(), b(), b(), b()]
    expect(one).toEqual(two)
  })

  it('differs between seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('stays in [0, 1)', () => {
    const r = makeRng(99)
    for (let i = 0; i < 5000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('valueNoise2D', () => {
  it('is deterministic', () => {
    expect(valueNoise2D(3.7, -1.2, 7)).toBe(valueNoise2D(3.7, -1.2, 7))
  })

  it('stays in [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const v = valueNoise2D(i * 0.37, i * -0.61, 5)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous: a small step in input makes a small step in output', () => {
    // This is the property that makes the islands read as smooth granite
    // rather than noise. If it fails, the terrain will look spiky.
    for (let i = 0; i < 200; i++) {
      const x = i * 0.13
      const a = valueNoise2D(x, 2.0, 3)
      const b = valueNoise2D(x + 0.01, 2.0, 3)
      expect(Math.abs(a - b)).toBeLessThan(0.1)
    }
  })

  it('varies with the seed', () => {
    expect(valueNoise2D(1.5, 1.5, 1)).not.toBe(valueNoise2D(1.5, 1.5, 2))
  })
})

describe('fbm2D', () => {
  it('stays in [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const v = fbm2D(i * 0.21, i * 0.44, 11, 3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic', () => {
    expect(fbm2D(2.2, 3.3, 4, 3)).toBe(fbm2D(2.2, 3.3, 4, 3))
  })
})

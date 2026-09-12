import { describe, expect, it } from 'vitest'
import { DESIGN_ASPECT, DESIGN_FOV, MAX_FOV, fovForAspect, framingPullback } from './viewport'

describe('fovForAspect', () => {
  it('is unchanged at the design aspect', () => {
    expect(fovForAspect(DESIGN_ASPECT)).toBeCloseTo(DESIGN_FOV, 6)
  })

  it('is unchanged above the design aspect', () => {
    expect(fovForAspect(21 / 9)).toBe(DESIGN_FOV)
  })

  it('widens below the design aspect', () => {
    expect(fovForAspect(4 / 3)).toBeGreaterThan(DESIGN_FOV)
  })

  it('never exceeds the ceiling, even at extreme portrait', () => {
    expect(fovForAspect(0.462)).toBeLessThanOrEqual(MAX_FOV)
    expect(fovForAspect(0.2)).toBeLessThanOrEqual(MAX_FOV)
  })

  it('widens monotonically as the aspect narrows', () => {
    const aspects = [DESIGN_ASPECT, 1.5, 4 / 3, 1, 0.75, 0.462]
    const fovs = aspects.map(fovForAspect)
    for (let i = 1; i < fovs.length; i++) {
      expect(fovs[i]).toBeGreaterThanOrEqual(fovs[i - 1])
    }
  })

  it('guards against a degenerate aspect', () => {
    expect(fovForAspect(0)).toBe(DESIGN_FOV)
    expect(fovForAspect(NaN)).toBe(DESIGN_FOV)
    expect(fovForAspect(-1)).toBe(DESIGN_FOV)
  })
})

describe('framingPullback', () => {
  it('is exactly 1 at the design aspect and anything wider', () => {
    expect(framingPullback(DESIGN_ASPECT)).toBe(1)
    expect(framingPullback(3 / 2)).toBeCloseTo(1, 6)
    expect(framingPullback(21 / 9)).toBe(1)
  })

  it('is exactly 1 at 4:3, since the widened fov there already recovers the design coverage', () => {
    expect(framingPullback(4 / 3)).toBeCloseTo(1, 3)
  })

  it('matches the authored figures below the design aspect', () => {
    expect(framingPullback(1)).toBeCloseTo(1.08, 2)
    expect(framingPullback(3 / 4)).toBeCloseTo(1.44, 2)
    expect(framingPullback(390 / 844)).toBeCloseTo(2.338, 2)
  })

  it('widens monotonically as the aspect narrows', () => {
    const aspects = [DESIGN_ASPECT, 4 / 3, 1, 3 / 4, 390 / 844]
    const factors = aspects.map(framingPullback)
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1])
    }
  })

  it('guards against a degenerate aspect', () => {
    expect(framingPullback(0)).toBe(1)
    expect(framingPullback(NaN)).toBe(1)
  })
})

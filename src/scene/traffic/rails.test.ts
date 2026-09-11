import { describe, expect, it } from 'vitest'
import { LANES, lanePoint, laneHeading } from './rails'

/**
 * The bow-direction contract. Every vessel model is normalised to point along
 * -Z, and `laneHeading` is applied straight to `rotation.y`. Rotating the local
 * bow vector (0, 0, -1) by theta about Y gives a world direction of
 * (-sin theta, -cos theta) — so the heading is only correct if that equals the
 * direction the vessel is actually travelling along its lane.
 *
 * This got the sign wrong once already: with theta = bearing, the bow came out
 * as the x-mirror of the travel direction, so on the near lane (bearing 105)
 * vessels sailed sideways-backwards. Nothing in the scheduler tests could catch
 * it, because they only ever check distances and counts, never facing.
 */
function bowDirection(theta: number): [number, number] {
  return [-Math.sin(theta), -Math.cos(theta)]
}

/** The direction of travel, read straight off the lane's own geometry. */
function travelDirection(lane: (typeof LANES)[number], dir: 1 | -1): [number, number] {
  const [x0, z0] = lanePoint(lane, 0)
  const [x1, z1] = lanePoint(lane, dir * 10)
  const len = Math.hypot(x1 - x0, z1 - z0)
  return [(x1 - x0) / len, (z1 - z0) / len]
}

describe('laneHeading', () => {
  it('points the bow along the direction of travel, on every lane, both ways', () => {
    for (const lane of LANES) {
      for (const dir of [1, -1] as const) {
        const bow = bowDirection(laneHeading(lane, dir))
        const travel = travelDirection(lane, dir)
        expect(bow[0]).toBeCloseTo(travel[0], 6)
        expect(bow[1]).toBeCloseTo(travel[1], 6)
      }
    }
  })

  it('turns a vessel through 180 degrees when it runs the other way', () => {
    for (const lane of LANES) {
      const a = bowDirection(laneHeading(lane, 1))
      const b = bowDirection(laneHeading(lane, -1))
      expect(a[0]).toBeCloseTo(-b[0], 6)
      expect(a[1]).toBeCloseTo(-b[1], 6)
    }
  })
})

describe('lanePoint', () => {
  it('keeps every lane at its authored perpendicular distance from the boat', () => {
    for (const lane of LANES) {
      for (const d of [-lane.halfLength, 0, lane.halfLength]) {
        const [x, z] = lanePoint(lane, d)
        // Distance from the origin to the lane line, measured along the
        // perpendicular, must always be the authored offset.
        const [tx, tz] = travelDirection(lane, 1)
        const perp = Math.abs(x * tz - z * tx)
        expect(perp).toBeCloseTo(Math.abs(lane.offsetM), 6)
      }
    }
  })
})

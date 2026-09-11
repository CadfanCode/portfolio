import { describe, expect, it } from 'vitest'
import { makeRng } from '../archipelago/noise'
import { LANES } from './rails'
import { seedLane, stepLane, vesselDistance, type LaneState } from './scheduler'

const NEAR = LANES.find((l) => l.id === 'near')!

/** Run a lane forward and sample how many vessels are active at each step. */
function simulate(lane = NEAR, seconds = 10_000, dt = 1, seed = 1234) {
  const rng = makeRng(seed)
  let state: LaneState = seedLane(lane, rng, 0)
  const counts: number[] = []
  for (let t = 0; t < seconds; t += dt) {
    state = stepLane(state, lane, rng, t)
    counts.push(state.active.length)
  }
  return counts
}

describe('traffic scheduler', () => {
  it('never exceeds the concurrent cap', () => {
    expect(Math.max(...simulate())).toBeLessThanOrEqual(NEAR.maxConcurrent)
  })

  it('leaves the water empty a meaningful fraction of the time', () => {
    // The owner asked for "sometimes no boats". A Poisson process with
    // lambda*T ~= 1 gives P(0) ~= 0.37. Anything outside this band means the
    // rate or the transit time has drifted and the feature stops reading as
    // random traffic.
    const counts = simulate()
    const empty = counts.filter((c) => c === 0).length / counts.length
    expect(empty).toBeGreaterThan(0.20)
    expect(empty).toBeLessThan(0.60)
  })

  it('shows several boats at once some of the time', () => {
    const counts = simulate()
    expect(counts.filter((c) => c >= 2).length / counts.length).toBeGreaterThan(0.05)
  })

  it('seeds a non-degenerate spread of initial occupancies', () => {
    // Without seeding, every visitor's first view is an empty sea and boats
    // only trickle in over minutes. For a visit that may last ninety seconds
    // that would mean the feature is effectively never seen.
    const initial = new Set<number>()
    for (let s = 0; s < 400; s++) initial.add(seedLane(NEAR, makeRng(s), 0).active.length)
    expect(initial.size).toBeGreaterThan(2)
    expect(initial.has(0)).toBe(true)
    expect([...initial].some((n) => n >= 2)).toBe(true)
  })

  it('despawns vessels once they pass the end of the lane', () => {
    const counts = simulate(NEAR, 4000)
    // If nothing ever despawned the count would pin at the cap and stay there.
    expect(counts.filter((c) => c === 0).length).toBeGreaterThan(0)
  })

  it('keeps every active vessel within the lane bounds', () => {
    const rng = makeRng(77)
    let state = seedLane(NEAR, rng, 0)
    for (let t = 0; t < 4000; t++) {
      state = stepLane(state, NEAR, rng, t)
      for (const v of state.active) {
        expect(Math.abs(vesselDistance(v, t))).toBeLessThanOrEqual(NEAR.halfLength + 1)
      }
    }
  })

  it('is deterministic for a seed', () => {
    expect(simulate(NEAR, 2000, 1, 5)).toEqual(simulate(NEAR, 2000, 1, 5))
  })

  it('respects each lane cap, not just the near one', () => {
    for (const lane of LANES) {
      expect(Math.max(...simulate(lane, 20_000))).toBeLessThanOrEqual(lane.maxConcurrent)
    }
  })
})

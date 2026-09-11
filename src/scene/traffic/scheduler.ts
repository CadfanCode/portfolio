// Pure Poisson spawn/despawn state machine for one traffic lane. No React,
// no three.js — this is deliberately test-driven with plain statistics, since
// the product requirement ("sometimes no boats, sometimes several") is a
// statement about the arrival distribution, not about any rendering detail.

import { FLEET, pickClass, type VesselClass } from './fleet'
import type { LaneDef } from './rails'

/** One vessel currently on a lane. Position is derived, never stored directly, so `stepLane` never has to reconcile two sources of truth for where a vessel is. */
export type Vessel = {
  id: number
  classId: VesselClass['id']
  /** Distance along the lane at t = spawnedAt. */
  startD: number
  dir: 1 | -1
  speed: number
  spawnedAt: number
}

/** All state needed to advance one lane: who is on it, and when the next arrival is due. */
export type LaneState = { active: Vessel[]; nextId: number; nextSpawnAt: number }

/** Distance along the lane at time `now`, extrapolated linearly from spawn. */
export function vesselDistance(v: Vessel, now: number): number {
  return v.startD + v.dir * v.speed * (now - v.spawnedAt)
}

/** Exponential inter-arrival time, the hallmark of a Poisson process. */
function sampleGap(lane: LaneDef, rng: () => number): number {
  return -Math.log(1 - rng()) * lane.meanGapS
}

/** Knuth's algorithm for a Poisson-distributed integer with the given mean. */
function samplePoisson(mean: number, rng: () => number): number {
  if (mean <= 0) return 0
  const limit = Math.exp(-mean)
  let k = 0
  let p = 1
  do {
    k += 1
    p *= rng()
  } while (p > limit)
  return k - 1
}

/** Average of a class's speed range, used only to estimate mean transit time for the stationary-distribution draw in `seedLane`. */
function meanSpeed(cls: VesselClass): number {
  return (cls.speedRange[0] + cls.speedRange[1]) / 2
}

/** Build a vessel with a random direction, entering at the corresponding end of the lane. */
function spawnAtEnd(lane: LaneDef, rng: () => number, id: number, now: number): Vessel {
  const dir: 1 | -1 = rng() < 0.5 ? 1 : -1
  const cls = pickClass(lane.id, rng)
  const speed = cls.speedRange[0] + rng() * (cls.speedRange[1] - cls.speedRange[0])
  return { id, classId: cls.id, startD: -dir * lane.halfLength, dir, speed, spawnedAt: now }
}

/** Build a vessel already under way, placed uniformly along the lane with a random direction — used only by `seedLane`. */
function spawnInFlight(lane: LaneDef, rng: () => number, id: number, now: number): Vessel {
  const dir: 1 | -1 = rng() < 0.5 ? 1 : -1
  const cls = pickClass(lane.id, rng)
  const speed = cls.speedRange[0] + rng() * (cls.speedRange[1] - cls.speedRange[0])
  const startD = -lane.halfLength + rng() * 2 * lane.halfLength
  return { id, classId: cls.id, startD, dir, speed, spawnedAt: now }
}

/**
 * Populate a lane at t = 0 by drawing an occupancy from the queue's
 * stationary distribution (Poisson with mean lambda * meanTransitTime, an
 * M/G/infinity result) and scattering vessels uniformly along the lane.
 * Without this every visitor's first view is an empty sea and traffic only
 * trickles in over minutes — too slow for a visit that may last 90 seconds.
 */
export function seedLane(lane: LaneDef, rng: () => number, now: number): LaneState {
  const classes = FLEET.filter((c) => c.lane === lane.id)
  const avgSpeed = classes.reduce((sum, c) => sum + meanSpeed(c), 0) / classes.length
  const meanTransitS = (2 * lane.halfLength) / avgSpeed
  const meanOccupancy = meanTransitS / lane.meanGapS
  const k = Math.min(samplePoisson(meanOccupancy, rng), lane.maxConcurrent)

  const active: Vessel[] = []
  let nextId = 0
  for (let i = 0; i < k; i++) {
    active.push(spawnInFlight(lane, rng, nextId, now))
    nextId += 1
  }
  return { active, nextId, nextSpawnAt: now + sampleGap(lane, rng) }
}

/** Advance a lane by removing vessels that have run off the end and spawning a new one if it is due and there is room. */
export function stepLane(state: LaneState, lane: LaneDef, rng: () => number, now: number): LaneState {
  const active = state.active.filter((v) => Math.abs(vesselDistance(v, now)) <= lane.halfLength)
  let nextId = state.nextId
  let nextSpawnAt = state.nextSpawnAt

  if (now >= nextSpawnAt) {
    // Reschedule unconditionally, even if the cap below blocks this spawn.
    // Leaving `nextSpawnAt` in the past would make the scheduler fire the
    // instant a slot frees, pinning the lane at the cap and defeating the
    // "sometimes empty" requirement the moment traffic first fills up.
    nextSpawnAt = now + sampleGap(lane, rng)
    if (active.length < lane.maxConcurrent) {
      active.push(spawnAtEnd(lane, rng, nextId, now))
      nextId += 1
    }
  }

  return { active, nextId, nextSpawnAt }
}

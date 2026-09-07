import type { LaneId } from './rails'

/** Authored properties of one vessel type. Rendering and physics read this table; nothing here is derived. */
export type VesselClass = {
  id: 'sail_a' | 'sail_b' | 'steamer' | 'tug' | 'ferry'
  modelFile: string
  lane: LaneId
  /** Relative spawn weight within its lane; does not need to sum to anything in particular. */
  weight: number
  speedRange: [number, number]
  /** Real-world length in metres; models are normalised to this by `normalise.ts`. */
  lengthM: number
  /** Whether the hull leans with apparent wind (sailboats) or stays upright (powered craft). */
  heels: boolean
}

/**
 * Five classes split across the three lanes: small sail traffic close in,
 * working boats in the middle distance, one big ferry far out. Weights favour
 * the small, frequent classes so the near lane reads as lively yacht traffic.
 */
export const FLEET: readonly VesselClass[] = [
  { id: 'sail_a', modelFile: 'sailboat-a.glb', lane: 'near', weight: 35, speedRange: [2.5, 4.0], lengthM: 8, heels: true },
  { id: 'sail_b', modelFile: 'sailboat-b.glb', lane: 'near', weight: 25, speedRange: [2.5, 4.0], lengthM: 8, heels: true },
  { id: 'steamer', modelFile: 'steamer.glb', lane: 'mid', weight: 20, speedRange: [5.0, 5.0], lengthM: 30, heels: false },
  { id: 'tug', modelFile: 'tug.glb', lane: 'mid', weight: 15, speedRange: [4.0, 4.0], lengthM: 20, heels: false },
  { id: 'ferry', modelFile: 'ferry.glb', lane: 'far', weight: 5, speedRange: [7.0, 7.0], lengthM: 160, heels: false },
]

/** Pick a vessel class for a lane, weighted by `weight` among that lane's classes. */
export function pickClass(lane: LaneId, rng: () => number): VesselClass {
  const candidates = FLEET.filter((c) => c.lane === lane)
  const total = candidates.reduce((sum, c) => sum + c.weight, 0)
  let roll = rng() * total
  for (const c of candidates) {
    roll -= c.weight
    if (roll <= 0) return c
  }
  return candidates[candidates.length - 1]
}

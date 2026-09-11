// Wires the pure `scheduler.ts` state machine to frame time and the quality
// tier's concurrency caps, and hands `Traffic.tsx` a roster of on-screen
// vessels to mount. No three.js here — this is the React glue, not the
// rendering.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQualityStore } from '../../state/useQualityStore'
import { FLEET } from './fleet'
import type { VesselClass } from './fleet'
import { LANES } from './rails'
import type { LaneDef } from './rails'
import { seedLane, stepLane } from './scheduler'
import type { LaneState } from './scheduler'

const CLASS_BY_ID = new Map(FLEET.map((c) => [c.id, c]))

/** Looks up a vessel's full class record from the id `scheduler.ts` carries.
 *  `Vessel.classId` only stores the string so the pure scheduler module never
 *  has to reach for fleet-table objects, just compare a key. */
export function vesselClass(id: VesselClass['id']): VesselClass {
  const cls = CLASS_BY_ID.get(id)
  if (!cls) throw new Error(`unknown vessel class "${id}"`)
  return cls
}

/**
 * One vessel currently on the water, with everything `Traffic.tsx` needs to
 * mount and animate it: its class and the lane it rides.
 *
 * Deliberately missing its current distance along the lane — that moves
 * every frame, so publishing it here would mean re-rendering on every frame
 * it changed. `Traffic.tsx` derives it itself, every frame, straight from
 * `vesselDistance(v, t)` using the fields this does carry (`spawnedAt`,
 * `speed`, `dir`, `startD`), the same pure function the scheduler uses.
 */
export type ActiveVessel = {
  id: number
  classId: VesselClass['id']
  lane: LaneDef
  dir: 1 | -1
  speed: number
  spawnedAt: number
  startD: number
}

function flatten(lanes: readonly LaneDef[], states: LaneState[]): ActiveVessel[] {
  const out: ActiveVessel[] = []
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i]
    for (const v of states[i].active) {
      out.push({
        id: v.id,
        classId: v.classId,
        lane,
        dir: v.dir,
        speed: v.speed,
        spawnedAt: v.spawnedAt,
        startD: v.startD,
      })
    }
  }
  return out
}

/**
 * Advances the three traffic lanes and returns the current roster of active
 * vessels.
 *
 * The scheduler's own `LaneState` — three lanes' worth of distance, speed and
 * spawn time, advancing continuously — lives in a ref and is stepped every
 * frame with `stepLane`. Per the architecture note on this task, putting that
 * in React state would re-render the whole tree at 60 fps for numbers nobody
 * reads through props; `Traffic.tsx` reads positions by recomputing them from
 * time, not by receiving them as props. What this hook actually publishes
 * through `useState` is coarser: the *roster* — which vessel ids exist right
 * now — which only changes when a lane spawns or despawns a vessel, at most a
 * few times a minute (`meanGapS` is 200-420 s per lane). Re-rendering on that
 * is free, and it is what lets `Traffic.tsx` mount and unmount one component
 * per vessel declaratively instead of hand-managing a fixed pool.
 */
export function useTraffic(): ActiveVessel[] {
  const caps = useQualityStore((s) => s.settings.traffic.maxConcurrent)

  // The high-tier concurrency `rails.ts` authors into `LANES` is overridden
  // here by the quality tier's own caps (see `quality.ts`'s `traffic` field).
  // Memoised on `caps`, which is referentially stable for the session — every
  // tier's settings object is a module constant in `quality.ts` — so this
  // array is built once, not every render.
  const lanes = useMemo<LaneDef[]>(
    () => LANES.map((lane) => ({ ...lane, maxConcurrent: caps[lane.id] })),
    [caps],
  )

  const statesRef = useRef<LaneState[] | null>(null)
  const [roster, setRoster] = useState<ActiveVessel[]>([])

  useEffect(() => {
    // Traffic timing is the one thing in this scene that is deliberately not
    // seeded (see Global Constraints: islands and prop scatter must be
    // byte-identical across loads, traffic timing is live-random) — every
    // visit should open on a different sea, not a replay of the same one.
    // `Math.random` is the right rng here, the only place in the scene that
    // reaches for it directly rather than through `makeRng`.
    const seeded = lanes.map((lane) => seedLane(lane, Math.random, 0))
    statesRef.current = seeded
    setRoster(flatten(lanes, seeded))
    // `lanes` only changes identity if the quality tier's caps object does,
    // which never happens mid-session (the tier is resolved once at import)
    // — this effect is a mount-once seed, not a resubscription.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((state) => {
    const prev = statesRef.current
    if (!prev) return
    const t = state.clock.elapsedTime
    let changed = false
    const next = prev.map((s, i) => {
      const stepped = stepLane(s, lanes[i], Math.random, t)
      if (stepped.active.length !== s.active.length) {
        changed = true
      } else {
        for (let k = 0; k < stepped.active.length; k++) {
          if (stepped.active[k].id !== s.active[k].id) {
            changed = true
            break
          }
        }
      }
      return stepped
    })
    statesRef.current = next
    // Only the rare membership change goes through `setState`; the common
    // case (every lane's `active` array unchanged in length and id order) is
    // a no-op react to nothing, exactly as the header above promises.
    if (changed) setRoster(flatten(lanes, next))
  })

  return roster
}

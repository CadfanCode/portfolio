import { describe, expect, it } from 'vitest'
import { SKIRT_R } from '../archipelago/island'
import { ISLANDS } from '../archipelago/layout'
import { LANES, lanePoint } from './rails'

/**
 * The "vessels stay in open water" invariant. `rails.ts`'s lane bearings and
 * offsets were solved by hand against `layout.ts`'s island placement, so that
 * no lane ever passes inside an island's underwater skirt (`SKIRT_R` — see
 * `island.ts`). That coupling is deliberate but silent: nothing else in the
 * codebase checks it, so retuning either the lanes or the islands can put a
 * boat back on the rocks without either file's own tests noticing. This test
 * is the tripwire — it must keep passing across changes to both files.
 *
 * `ISLANDS` must always come from `layout.ts`, never from a local
 * reconstruction of the far band's generator. A hand-rolled RNG standing in
 * for `makeRng` produces a different nine islands, which is exactly how the
 * first attempt at the far lane's offset passed a by-hand check yet still
 * ran a vessel through `far-5` once checked against the real placement.
 */
const SAMPLE_STEP_M = 2

describe('traffic lanes stay clear of every island', () => {
  it('never enters an island footprint or its skirt', () => {
    const failures: string[] = []

    for (const lane of LANES) {
      for (let d = -lane.halfLength; d <= lane.halfLength; d += SAMPLE_STEP_M) {
        const [x, z] = lanePoint(lane, d)

        for (const island of ISLANDS) {
          const dx = x - island.centre[0]
          const dz = z - island.centre[1]
          const cos = Math.cos(island.rotation)
          const sin = Math.sin(island.rotation)
          const lx = dx * cos + dz * sin
          const lz = -dx * sin + dz * cos
          const r = Math.hypot(lx / island.a, lz / island.b)

          if (r <= SKIRT_R) {
            failures.push(
              `lane ${lane.id} enters ${island.id} at d=${d} world=(${x.toFixed(1)}, ${z.toFixed(1)}) r=${r.toFixed(3)}`,
            )
          }
        }
      }
    }

    expect(failures).toEqual([])
  })
})

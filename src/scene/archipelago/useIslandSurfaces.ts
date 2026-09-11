import { useEffect, useMemo } from 'react'
import { useQualityStore } from '../../state/useQualityStore'
import { buildIsland } from './island'
import type { IslandDef, IslandSurface } from './island'
import { ISLANDS } from './layout'

/** An island's authored definition paired with the geometry and height
 *  queries built from it. Kept together, rather than handing back bare
 *  `IslandSurface[]`, because `props.tsx` needs each surface's `IslandDef`
 *  (its id, to look up pine counts; its footprint, to snap authored props to
 *  the right island) alongside the mesh `Archipelago` renders from the same
 *  array. */
export type IslandInstance = { def: IslandDef; surface: IslandSurface }

/**
 * Builds every island's geometry once per quality-affecting change and hands
 * back the `IslandInstance[]`, not just the meshes. Split out from
 * `Archipelago` itself — rather than building surfaces inside it and
 * discarding them — because the prop scatter in `props.tsx` needs
 * `sampleAt`/`slopeAt` for the exact same surfaces the rock is drawn from:
 * building them twice from two different memos would let a pine and the
 * ground it stands on quietly disagree.
 */
export function useIslandSurfaces(): IslandInstance[] {
  const islandSegments = useQualityStore((s) => s.settings.archipelago.islandSegments)
  const farIslands = useQualityStore((s) => s.settings.archipelago.farIslands)

  const instances = useMemo(() => {
    // The far band is generated in a fixed order (see layout.ts), so slicing
    // to `farIslands` only ever adds islands already in that order — raising
    // the tier never reshuffles a coastline a visitor has already seen.
    const defs = ISLANDS.filter((def) => def.tier !== 'far').concat(
      ISLANDS.filter((def) => def.tier === 'far').slice(0, farIslands),
    )
    return defs.map((def) => ({ def, surface: buildIsland(def, islandSegments[def.tier]) }))
  }, [islandSegments, farIslands])

  useEffect(() => {
    return () => {
      for (const { surface } of instances) surface.geometry.dispose()
    }
  }, [instances])

  return instances
}

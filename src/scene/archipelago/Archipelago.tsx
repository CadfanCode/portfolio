import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import { useQualityStore } from '../../state/useQualityStore'
import { useGraniteMaterial } from './granite'
import { buildIsland } from './island'
import type { IslandSurface } from './island'
import { ISLANDS } from './layout'

/**
 * Builds every island's geometry once per quality-affecting change and hands
 * back the `IslandSurface[]`, not just the meshes. Split out from
 * `Archipelago` itself — rather than building surfaces inside it and
 * discarding them — because Task 6's prop scatter needs `sampleAt`/`slopeAt`
 * for the exact same surfaces the rock is drawn from: building them twice
 * from two different memos would let a pine and the ground it stands on
 * quietly disagree.
 */
export function useIslandSurfaces(): IslandSurface[] {
  const islandSegments = useQualityStore((s) => s.settings.archipelago.islandSegments)
  const farIslands = useQualityStore((s) => s.settings.archipelago.farIslands)

  const surfaces = useMemo(() => {
    // The far band is generated in a fixed order (see layout.ts), so slicing
    // to `farIslands` only ever adds islands already in that order — raising
    // the tier never reshuffles a coastline a visitor has already seen.
    const defs = ISLANDS.filter((def) => def.tier !== 'far').concat(
      ISLANDS.filter((def) => def.tier === 'far').slice(0, farIslands),
    )
    return defs.map((def) => buildIsland(def, islandSegments[def.tier]))
  }, [islandSegments, farIslands])

  useEffect(() => {
    return () => {
      for (const surface of surfaces) surface.geometry.dispose()
    }
  }, [surfaces])

  return surfaces
}

/**
 * Mounts one mesh per island, sharing the single granite material. Positions
 * are already baked into world space by `buildIsland` (see `island.ts`), so
 * these mesh directly with no transform of their own — the same way
 * `Boat.tsx` mounts the hull.
 */
export function Archipelago() {
  const surfaces = useIslandSurfaces()
  const material = useGraniteMaterial()

  return (
    <>
      {surfaces.map((surface, i) => (
        <IslandMesh key={i} geometry={surface.geometry} material={material} />
      ))}
    </>
  )
}

type IslandMeshProps = {
  geometry: BufferGeometry
  material: ReturnType<typeof useGraniteMaterial>
}

/**
 * A thin per-island component rather than an inline `<mesh>` in the map
 * above so `castShadow`/`receiveShadow` are unambiguous props on a mesh with
 * exactly one geometry and one material — no risk of the wrong one landing
 * on the wrong island as the array is edited.
 */
function IslandMesh({ geometry, material }: IslandMeshProps) {
  return (
    <mesh
      geometry={geometry}
      material={material}
      // The shadow camera is [-7, 7, 9, -9, 0.1, 80] (see PortfolioWorld.tsx)
      // and never reaches these islands at 72-1300 m out, so asking for
      // shadows here would cost a pass and buy nothing.
      castShadow={false}
      receiveShadow={false}
    />
  )
}

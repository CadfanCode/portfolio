import type { BufferGeometry } from 'three'
import { useGraniteMaterial } from './granite'
import { Props } from './props'
import { useIslandSurfaces } from './useIslandSurfaces'

/**
 * Mounts one mesh per island, sharing the single granite material, plus the
 * scattered pines and hand-placed landmarks on top of them. Positions are
 * already baked into world space by `buildIsland` (see `island.ts`), so
 * these mesh directly with no transform of their own — the same way
 * `Boat.tsx` mounts the hull.
 */
export function Archipelago() {
  const instances = useIslandSurfaces()
  const material = useGraniteMaterial()

  return (
    <>
      {instances.map(({ def, surface }) => (
        <IslandMesh key={def.id} geometry={surface.geometry} material={material} />
      ))}
      <Props islands={instances} />
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

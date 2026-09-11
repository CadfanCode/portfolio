import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'
import { useQualityStore } from '../../state/useQualityStore'
import kitUrl from '../../assets/models/archipelago-kit.glb?url'
import { collectKitParts } from './kit'
import type { KitPart } from './kit'
import { AUTHORED_PROPS, ISLAND_DRESSING, farBandDressing } from './layout'
import { PROP_KINDS, scatterLayer } from './scatter'
import type { Placement, PropKind, ScatterLayer } from './scatter'
import type { IslandInstance } from './useIslandSurfaces'

useGLTF.preload(kitUrl)

/**
 * A scattered prop is rejected if it falls within this of an authored
 * building, even when the layer's own `minSpacing` is tighter — a juniper's
 * 2.2 m is fine juniper-to-juniper, but not nearly enough clearance from a
 * cottage wall. `layer.minSpacing` still wins when it is already larger (a
 * shore boulder layer, say), so this only ever widens the gap around a roof.
 */
const BUILDING_CLEARANCE_M = 6

/** Drop any placement that landed too close to a building. Applied after
 *  `scatterLayer`, rather than folded into its own `avoid` check, because the
 *  clearance a building needs is not the uniform `layer.minSpacing` every
 *  other rejection in that function uses — see `BUILDING_CLEARANCE_M`. */
function clearOfBuildings(placements: Placement[], buildings: Placement[], minSpacing: number): Placement[] {
  if (buildings.length === 0) return placements
  const clearance = Math.max(minSpacing, BUILDING_CLEARANCE_M)
  return placements.filter((p) =>
    buildings.every((b) => Math.hypot(b.position[0] - p.position[0], b.position[2] - p.position[2]) >= clearance),
  )
}

// Instance matrices are composed once, in the layout effect below, from
// these shared temporaries — never per frame, since every prop here is
// static. React runs layout effects one at a time, so reusing module-scope
// scratch objects across every `PropInstances` mount is safe.
const Y_AXIS = new Vector3(0, 1, 0)
const scratchPosition = new Vector3()
const scratchQuaternion = new Quaternion()
const scratchScale = new Vector3()
const scratchMatrix = new Matrix4()
const scratchInstanceMatrix = new Matrix4()

type PropsProps = { islands: IslandInstance[] }

/**
 * Scatters every island's dressing layers and places the hand-authored
 * landmarks from `layout.ts`, all as `InstancedMesh` draws from the one
 * shared prop kit. Not one draw call per `PropKind`: a part with more than
 * one material — every house, both boathouse variants, the flagpole, all
 * three pine kinds, birch — draws as one `InstancedMesh` per primitive, so a
 * `house_red` is four draw calls and a `birch` is three. See `kit.ts`.
 */
export function Props({ islands }: PropsProps) {
  const pineDensity = useQualityStore((s) => s.settings.archipelago.pineDensity)
  const { nodes } = useGLTF(kitUrl)

  const placements = useMemo(() => {
    const all: Placement[] = []

    // Group the authored buildings by whichever island's footprint actually
    // contains them, snapping each to that island's surface as we go — see
    // the comment on `AUTHORED_PROPS` for why the height isn't baked into
    // `layout.ts` directly. Scattering below needs this same grouping to
    // keep pines and junipers from growing through a roof.
    const buildingsByIsland = new Map<string, Placement[]>()
    for (const authored of AUTHORED_PROPS) {
      const [x, , z] = authored.position
      const owner = islands.find((i) => i.surface.sampleAt(x, z) !== null)
      const y = owner?.surface.sampleAt(x, z) ?? authored.position[1]
      const snapped = { ...authored, position: [x, y, z] as [number, number, number] }
      all.push(snapped)
      if (owner) {
        const list = buildingsByIsland.get(owner.def.id)
        if (list) list.push(snapped)
        else buildingsByIsland.set(owner.def.id, [snapped])
      }
    }

    for (const { def, surface } of islands) {
      const layers: ScatterLayer[] = ISLAND_DRESSING[def.id] ?? (def.tier === 'far' ? farBandDressing(def) : [])
      if (layers.length === 0) continue

      const buildings = buildingsByIsland.get(def.id) ?? []
      // Each layer avoids every layer scattered before it, plus the island's
      // buildings, so rocks, trees and juniper stack without interpenetrating
      // and nothing roots through a wall — see `ISLAND_DRESSING`'s doc for
      // why the array order (rocks, then trees, then juniper) is fixed.
      const scatteredSoFar: Placement[] = []

      for (const layer of layers) {
        const scaled: ScatterLayer = { ...layer, count: Math.round(layer.count * pineDensity) }
        const placed = clearOfBuildings(
          scatterLayer(surface, def, scaled, [...scatteredSoFar, ...buildings]),
          buildings,
          layer.minSpacing,
        )
        scatteredSoFar.push(...placed)
        all.push(...placed)
      }
    }

    return all
  }, [islands, pineDensity])

  const byKind = useMemo(() => {
    const grouped = new Map<PropKind, Placement[]>()
    for (const p of placements) {
      const list = grouped.get(p.kind)
      if (list) list.push(p)
      else grouped.set(p.kind, [p])
    }
    return grouped
  }, [placements])

  // `collectKitParts` allocates fresh geometry/material lists and Matrix4s;
  // building the lookup once here, keyed only on `nodes`, keeps that array's
  // identity stable across renders so the layout effect below doesn't
  // recompose every instance matrix on every render that doesn't touch the
  // GLTF itself.
  const kitParts = useMemo(() => {
    const map = new Map<PropKind, KitPart[]>()
    for (const kind of PROP_KINDS) {
      map.set(kind, collectKitParts(nodes[kind] as Object3D))
    }
    return map
  }, [nodes])

  return (
    <>
      {Array.from(byKind, ([kind, list]) => {
        const parts = kitParts.get(kind) ?? []
        if (parts.length === 0) {
          // A typo'd PropKind, or a kit rebuilt without this part: instancing
          // an empty geometry draws nothing with no error, which is exactly
          // how the pines and houses went missing in the first place.
          console.warn(`archipelago prop kit has no mesh for "${kind}"`)
          return null
        }
        return <PropInstances key={kind} placements={list} parts={parts} />
      })}
    </>
  )
}

type PropInstancesProps = { placements: Placement[]; parts: KitPart[] }

/** One `InstancedMesh` per kit primitive, matrices filled exactly once. All
 *  primitives belonging to the same `PropKind` share the placement list, so
 *  a two-material house still moves as one object even though it draws as
 *  two instanced meshes. */
function PropInstances({ placements, parts }: PropInstancesProps) {
  const refs = useRef<(InstancedMesh | null)[]>([])

  useLayoutEffect(() => {
    parts.forEach((part, partIndex) => {
      const instanced = refs.current[partIndex]
      if (!instanced) return
      placements.forEach((p, i) => {
        scratchPosition.set(p.position[0], p.position[1], p.position[2])
        scratchQuaternion.setFromAxisAngle(Y_AXIS, p.rotation)
        scratchScale.setScalar(p.scale)
        scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale)
        // The placement matrix positions the kit node's own origin; each
        // primitive's `offset` is that node's local transform, so composing
        // the two puts every primitive of a multi-material part back where
        // it sat in the source GLB.
        scratchInstanceMatrix.copy(scratchMatrix).multiply(part.offset)
        instanced.setMatrixAt(i, scratchInstanceMatrix)
      })
      instanced.instanceMatrix.needsUpdate = true
      instanced.computeBoundingSphere()
    })
  }, [placements, parts])

  if (placements.length === 0) return null

  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          args={[part.geometry, part.material, placements.length]}
        />
      ))}
    </>
  )
}

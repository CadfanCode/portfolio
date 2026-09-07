import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import type { Mesh } from 'three'
import { useQualityStore } from '../../state/useQualityStore'
import kitUrl from '../../assets/models/archipelago-kit.glb?url'
import { AUTHORED_PROPS } from './layout'
import { scatterPines } from './scatter'
import type { Placement, PropKind } from './scatter'
import type { IslandInstance } from './useIslandSurfaces'

useGLTF.preload(kitUrl)

/** Base pine counts per island, before the quality tier's `pineDensity`
 *  multiplier. Authored per the spec: `island-mid` carries the bulk of the
 *  treeline, `skerry-port` a smaller stunted stand. Any island absent from
 *  this table — the far band, and `skerry-near`, whose whole point is bare
 *  granite — gets no pines at all. */
const PINE_COUNTS: Readonly<Record<string, number>> = {
  'island-mid': 180,
  'skerry-port': 20,
}

/** Seeds for each island's pine scatter, kept apart from the island's own
 *  terrain seed (`layout.ts`) so regenerating one never perturbs the other. */
const PINE_SEEDS: Readonly<Record<string, number>> = {
  'island-mid': 5001,
  'skerry-port': 5002,
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

type PropsProps = { islands: IslandInstance[] }

/**
 * Scatters pines across the islands that carry them and places the
 * hand-authored landmarks from `layout.ts`, all as `InstancedMesh` draws
 * from the one shared prop kit — one draw call per `PropKind`, however many
 * instances of it there are.
 */
export function Props({ islands }: PropsProps) {
  const pineDensity = useQualityStore((s) => s.settings.archipelago.pineDensity)
  const { nodes } = useGLTF(kitUrl)

  const placements = useMemo(() => {
    const all: Placement[] = []

    for (const { def, surface } of islands) {
      const base = PINE_COUNTS[def.id]
      if (!base) continue
      const count = Math.round(base * pineDensity)
      const seed = PINE_SEEDS[def.id]
      all.push(...scatterPines(surface, def, count, seed))
    }

    for (const authored of AUTHORED_PROPS) {
      // Find whichever island's footprint actually contains this point and
      // snap to its surface — see the comment on `AUTHORED_PROPS` for why
      // the height is not baked into `layout.ts` directly.
      const [x, , z] = authored.position
      const owner = islands.find((i) => i.surface.sampleAt(x, z) !== null)
      const y = owner?.surface.sampleAt(x, z) ?? authored.position[1]
      all.push({ ...authored, position: [x, y, z] })
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

  return (
    <>
      {Array.from(byKind, ([kind, list]) => (
        <PropInstances key={kind} placements={list} mesh={nodes[kind] as Mesh} />
      ))}
    </>
  )
}

type PropInstancesProps = { placements: Placement[]; mesh: Mesh }

/** One `InstancedMesh` per `PropKind`, matrices filled exactly once. */
function PropInstances({ placements, mesh }: PropInstancesProps) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const instanced = ref.current
    if (!instanced) return
    placements.forEach((p, i) => {
      scratchPosition.set(p.position[0], p.position[1], p.position[2])
      scratchQuaternion.setFromAxisAngle(Y_AXIS, p.rotation)
      scratchScale.setScalar(p.scale)
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale)
      instanced.setMatrixAt(i, scratchMatrix)
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
  }, [placements])

  if (placements.length === 0) return null

  return <instancedMesh ref={ref} args={[mesh.geometry, mesh.material, placements.length]} />
}

import { useSceneStore } from '../../state/useSceneStore'
import { usePointerSelect } from '../usePointerSelect'
import { EXHIBITS } from './registry'
import type { Exhibit } from './types'

/**
 * One per exhibit — a component rather than inline JSX because usePointerSelect
 * can't be called inside a loop.
 */
function ExhibitHotspot({ exhibit }: { exhibit: Exhibit }) {
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const openExhibit = useSceneStore((s) => s.openExhibit)

  const { hovered, bind } = usePointerSelect({
    enabled: !isTransitioning,
    onSelect: () => openExhibit(exhibit.id),
  })

  const { HotspotMesh } = exhibit

  // Handlers sit on the group so the exhibit's own mesh needs no wiring —
  // R3F bubbles pointer events up the object graph.
  return (
    <group position={exhibit.position} name={exhibit.label} {...bind}>
      <HotspotMesh hovered={hovered} />
    </group>
  )
}

/** Renders the hotspot for every exhibit belonging to the current stop. */
export function Exhibits() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)

  // Hidden inside a close-up, for the reason `CabinHatch` is: the camera is
  // locked on one object, so anything else clickable in the cabin is a trap.
  if (focus) return null

  return (
    <>
      {EXHIBITS.filter((exhibit) => exhibit.scene === scene).map((exhibit) => (
        <ExhibitHotspot key={exhibit.id} exhibit={exhibit} />
      ))}
    </>
  )
}

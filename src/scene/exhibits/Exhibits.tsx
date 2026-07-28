import { useEffect, useState } from 'react'
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

  // `Exhibits` only renders this for an exhibit its own filter has already
  // confirmed has a `HotspotMesh`; the type stays optional on `Exhibit`
  // itself because most exhibits (the resume book, for one) don't.
  const HotspotMesh = exhibit.HotspotMesh
  if (!HotspotMesh) return null

  // Handlers sit on the group so the exhibit's own mesh needs no wiring —
  // R3F bubbles pointer events up the object graph.
  return (
    <group position={exhibit.position} name={exhibit.label} {...bind}>
      <HotspotMesh hovered={hovered} />
    </group>
  )
}

/**
 * Renders the hotspot for every exhibit reachable from where the camera is
 * right now, and keeps the active exhibit's `Scene` mounted through its exit.
 */
export function Exhibits() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)

  // A hotspot only fires when the camera is actually at its stop, and — for
  // one that lives inside a close-up — only once that close-up has arrived.
  // With no focus this reproduces today's stop-level hotspots unchanged;
  // inside a close-up it additionally surfaces any exhibit declared against
  // that focus id.
  const hotspots = EXHIBITS.filter(
    (exhibit) =>
      exhibit.scene === scene &&
      (exhibit.focus ?? null) === focus &&
      exhibit.position !== undefined &&
      exhibit.HotspotMesh !== undefined,
  )

  // The exhibit whose Scene is mounted, kept one step behind `activeExhibitId`
  // on the way out: `activeExhibitId` goes null the instant the panel closes,
  // but the 3D content needs to stay around long enough to play its own exit
  // and call `onExited` before it unmounts.
  const [staged, setStaged] = useState<string | null>(activeExhibitId)
  useEffect(() => {
    if (activeExhibitId) setStaged(activeExhibitId)
  }, [activeExhibitId])

  const stagedExhibit = EXHIBITS.find((exhibit) => exhibit.id === staged)
  const StagedScene = stagedExhibit?.Scene

  return (
    <>
      {hotspots.map((exhibit) => (
        <ExhibitHotspot key={exhibit.id} exhibit={exhibit} />
      ))}
      {StagedScene && (
        <StagedScene
          active={activeExhibitId === staged}
          onExited={() => setStaged(null)}
        />
      )}
    </>
  )
}

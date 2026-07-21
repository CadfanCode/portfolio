import { useEffect } from 'react'
import { useSceneStore } from '../../state/useSceneStore'
import { EXHIBITS } from './registry'
import './ExhibitOverlay.css'

/**
 * The active exhibit's content panel.
 *
 * Mounted outside the Canvas on purpose: exhibit copy stays ordinary DOM, so it
 * is selectable, searchable and reachable by a screen reader rather than being
 * baked into a texture. The full-screen backdrop also keeps drags from reaching
 * the camera controls while a panel is open.
 */
export function ExhibitOverlay() {
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const closeExhibit = useSceneStore((s) => s.closeExhibit)

  const exhibit = EXHIBITS.find((candidate) => candidate.id === activeExhibitId)

  // Above the early return, so hook order stays stable when nothing is open.
  useEffect(() => {
    if (!exhibit) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeExhibit()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exhibit, closeExhibit])

  if (!exhibit) return null

  const { Content, id, label } = exhibit
  const titleId = `exhibit-${id}-title`

  return (
    <div className="exhibit-backdrop" onClick={closeExhibit}>
      {/* Clicks inside the panel must not reach the backdrop's close handler. */}
      <div
        className="exhibit-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{label}</h2>
        <Content />
        <button type="button" className="exhibit-close" onClick={closeExhibit}>
          Close
        </button>
      </div>
    </div>
  )
}

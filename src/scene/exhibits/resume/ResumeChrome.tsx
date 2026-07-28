import { useEffect } from 'react'
import { useSceneStore } from '../../../state/useSceneStore'
import { RESUME_SPREAD_COUNT, useResumeBook } from './useResumeBook'
import './ResumeChrome.css'

/**
 * The arrows and the download link, drawn over the canvas rather than inside
 * the standard exhibit panel — `types.ts`'s "staged" shape exists exactly for
 * this: the book fills the frame, so its chrome has to sit on top of the
 * scene rather than beside it in a boxed panel.
 *
 * Everything here is `pointer-events: none` except the three controls
 * themselves (`resume-chrome.css`), and sits below `FocusExit`'s z-index of
 * 5 so the back button always stays reachable.
 */
export function ResumeChrome() {
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const spread = useResumeBook((s) => s.spread)
  const turning = useResumeBook((s) => s.turning)
  const turn = useResumeBook((s) => s.turn)

  const isOpen = activeExhibitId === 'resume'
  const atFirst = spread <= 0
  const atLast = spread >= RESUME_SPREAD_COUNT - 1
  const midTurn = turning !== null

  // Arrow keys turn pages, mirroring the on-screen buttons. Escape is
  // deliberately not handled here — `FocusExit` owns it, and a second
  // listener racing it to close the exhibit would be a coin flip.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') turn('backward')
      else if (event.key === 'ArrowRight') turn('forward')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, turn])

  if (!isOpen) return null

  return (
    <div className="resume-chrome">
      <button
        type="button"
        className="resume-arrow resume-arrow-left"
        onClick={() => turn('backward')}
        disabled={atFirst || midTurn}
        aria-label="Previous page"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <button
        type="button"
        className="resume-arrow resume-arrow-right"
        onClick={() => turn('forward')}
        disabled={atLast || midTurn}
        aria-label="Next page"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <a
        className="resume-download"
        href="/Cai_Birch_CV_Eng.pdf"
        download
        rel="noreferrer"
      >
        Download PDF
      </a>
    </div>
  )
}

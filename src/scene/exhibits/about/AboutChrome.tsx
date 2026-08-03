import { useEffect, useState } from 'react'
import type { AboutBlock } from '../../../content/about'
import { ABOUT_PAGES } from '../../../content/about'
import { useSceneStore } from '../../../state/useSceneStore'
import { ABOUT_SPREAD_COUNT, useAboutBook } from './useAboutBook'
import './AboutChrome.css'

/** The page (0-indexed into `ABOUT_PAGES`) and block that carry the video —
 *  found once at module load rather than hardcoded, so a future reorder of
 *  `ABOUT_PAGES` can't silently desync the "Watch video" button from the
 *  spread it's meant to open on. */
const VIDEO_PAGE_INDEX = ABOUT_PAGES.findIndex((page) =>
  page.blocks.some((block) => block.kind === 'video'),
)
const VIDEO_SPREAD = Math.floor(VIDEO_PAGE_INDEX / 2)
const VIDEO_BLOCK = ABOUT_PAGES[VIDEO_PAGE_INDEX]?.blocks.find(
  (block): block is Extract<AboutBlock, { kind: 'video' }> => block.kind === 'video',
)

/**
 * The arrows and the video-lightbox trigger, drawn over the canvas rather
 * than inside the standard exhibit panel — same reasoning as
 * `ResumeChrome.tsx`. Everything here is `pointer-events: none` except its
 * own controls, and sits below `FocusExit`'s z-index of 5 — except the
 * lightbox itself, which sits above it (`AboutChrome.css`): while a video is
 * open it is the topmost layer on purpose, with its own explicit close
 * controls, rather than leaving the exhibit's back button reachable behind
 * it. `.about-chrome` is `position: fixed` with its own z-index, which forms
 * a stacking context — so the lightbox is rendered as a *sibling* of it, not
 * a child, letting its z-index resolve in the root stacking context where it
 * can actually outrank `FocusExit` instead of being trapped underneath it.
 */
export function AboutChrome() {
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const spread = useAboutBook((s) => s.spread)
  const turning = useAboutBook((s) => s.turning)
  const turn = useAboutBook((s) => s.turn)

  const [lightboxOpen, setLightboxOpen] = useState(false)

  const isOpen = activeExhibitId === 'about'
  const atFirst = spread <= 0
  const atLast = spread >= ABOUT_SPREAD_COUNT - 1
  const midTurn = turning !== null
  const showVideoTrigger = spread === VIDEO_SPREAD && !midTurn && VIDEO_BLOCK !== undefined

  // The lightbox shouldn't persist into the next time the book is opened.
  useEffect(() => {
    if (!isOpen) setLightboxOpen(false)
  }, [isOpen])

  // Arrow keys turn pages, mirroring `ResumeChrome.tsx`. Escape is
  // deliberately not handled here for the *book* — `FocusExit` owns that,
  // same as the resume book — see the separate capture-phase listener below
  // for why the *lightbox* needs its own handling instead of racing it.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') turn('backward')
      else if (event.key === 'ArrowRight') turn('forward')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, turn])

  // Capture phase, not bubble: `FocusExit` binds its own Escape handler on
  // `window` in the bubble phase to close the exhibit. Registering this one
  // in the capture phase guarantees it runs first regardless of mount order,
  // and `stopPropagation` then keeps the event from ever reaching FocusExit's
  // listener — so Escape closes the lightbox before it can close the whole
  // exhibit, one level at a time, matching the rest of the app's back-out
  // behaviour. When the lightbox isn't open this handler is a no-op and lets
  // the event through to FocusExit exactly as before.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !lightboxOpen) return
      event.stopPropagation()
      setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isOpen, lightboxOpen])

  if (!isOpen) return null

  return (
    <>
      <div className="about-chrome">
        <button
          type="button"
          className="about-arrow about-arrow-left"
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
          className="about-arrow about-arrow-right"
          onClick={() => turn('forward')}
          disabled={atLast || midTurn}
          aria-label="Next page"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {showVideoTrigger && VIDEO_BLOCK && (
          <button type="button" className="about-watch" onClick={() => setLightboxOpen(true)}>
            ▶ Watch: {VIDEO_BLOCK.caption}
          </button>
        )}
      </div>
      {lightboxOpen && VIDEO_BLOCK && (
        <div className="about-lightbox" onClick={() => setLightboxOpen(false)}>
          <div className="about-lightbox-frame" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="about-lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close video"
              autoFocus
            >
              ×
            </button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_BLOCK.youtubeId}`}
              title={VIDEO_BLOCK.caption}
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </>
  )
}

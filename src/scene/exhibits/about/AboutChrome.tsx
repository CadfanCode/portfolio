import { useEffect, useRef, useState } from 'react'
import type { AboutBlock } from '../../../content/about'
import { ABOUT_PAGES } from '../../../content/about'
import { useSceneStore } from '../../../state/useSceneStore'
import { ABOUT_PAGE_CANVAS_SIZE, computeVideoLayoutRect } from './renderAboutPage'
import { ABOUT_SPREAD_COUNT, useAboutBook } from './useAboutBook'
import './AboutChrome.css'

/** The page (0-indexed into `ABOUT_PAGES`) and block that carry the video —
 *  found once at module load rather than hardcoded, so a future reorder of
 *  `ABOUT_PAGES` can't silently desync the hotspot from the spread it's
 *  meant to sit on. */
const VIDEO_PAGE_INDEX = ABOUT_PAGES.findIndex((page) =>
  page.blocks.some((block) => block.kind === 'video'),
)
const VIDEO_SPREAD = Math.floor(VIDEO_PAGE_INDEX / 2)
/** Even indices are left pages, odd are right — same convention as
 *  `content/about.ts`'s own header comment. */
const VIDEO_SIDE: 'left' | 'right' = VIDEO_PAGE_INDEX % 2 === 0 ? 'left' : 'right'
const VIDEO_BLOCK = ABOUT_PAGES[VIDEO_PAGE_INDEX]?.blocks.find(
  (block): block is Extract<AboutBlock, { kind: 'video' }> => block.kind === 'video',
)
const VIDEO_RECT =
  VIDEO_PAGE_INDEX >= 0 ? computeVideoLayoutRect(ABOUT_PAGES[VIDEO_PAGE_INDEX], VIDEO_SIDE) : null

if (VIDEO_BLOCK && !VIDEO_RECT) {
  // A content change broke `computeVideoLayoutRect`'s fast path (see its own
  // doc comment) — fail loud in dev rather than silently dropping the
  // hotspot, since nothing else would catch this at build time.
  console.warn('[AboutChrome] video block found but its layout rect could not be computed')
}

const { width: CANVAS_W, height: CANVAS_H } = ABOUT_PAGE_CANVAS_SIZE

/** The hotspot's position and size as a fraction of the full two-page
 *  spread — half the canvas width per page, offset by which side the video
 *  lives on — so it can be laid out with plain CSS percentages inside
 *  `.about-stage-spread` (see that class in `AboutChrome.css` for the
 *  on-screen geometry it mirrors). */
const VIDEO_HOTSPOT = VIDEO_RECT
  ? {
      xFrac: (VIDEO_SIDE === 'left' ? 0 : 0.5) + (VIDEO_RECT.cx / CANVAS_W) * 0.5,
      yFrac: VIDEO_RECT.cy / CANVAS_H,
      wFrac: (VIDEO_RECT.w / CANVAS_W) * 0.5,
      hFrac: VIDEO_RECT.h / CANVAS_H,
      angleDeg: VIDEO_RECT.angleDeg,
    }
  : null

type PixelRect = { top: number; left: number; width: number; height: number }

function computeEndRect(): PixelRect {
  const width = Math.min(window.innerWidth * 0.9, 960)
  const heightForWidth = (width * 9) / 16
  const height = Math.min(heightForWidth, window.innerHeight * 0.9)
  const finalWidth = height === heightForWidth ? width : (height * 16) / 9
  return {
    width: finalWidth,
    height,
    left: (window.innerWidth - finalWidth) / 2,
    top: (window.innerHeight - height) / 2,
  }
}

/**
 * The enlarged player, FLIP-animated from wherever the hotspot was on
 * screen to a large centred frame — "zoom into the page for a better view"
 * rather than a modal that pops up disconnected from the book. Mounted only
 * while `AboutChrome`'s `expanded` is true; unmounting is instant (no
 * reverse animation) when triggered by Escape, and a short shrink-back when
 * triggered by clicking the frame closed — see `handleClose` below for why
 * that asymmetry is an intentional simplification, not an oversight.
 */
function AboutVideoPlayer({
  startRect,
  youtubeId,
  caption,
  onClose,
}: {
  startRect: PixelRect | null
  youtubeId: string
  caption: string
  onClose: () => void
}) {
  const endRect = useRef(computeEndRect()).current
  const [rect, setRect] = useState<PixelRect>(startRect ?? endRect)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setRect(endRect)
      setSettled(true)
    })
    return () => cancelAnimationFrame(id)
  }, [endRect])

  // Only the manual close (backdrop or × click) gets the reverse animation:
  // it plays out while the visitor is still looking at it. Escape is a
  // "get me out now" gesture, so `AboutChrome` unmounts this immediately
  // instead of routing through here — building a cancellable version of
  // this timeout for that path isn't worth it for a close that's meant to
  // feel instant anyway.
  const handleClose = () => {
    setSettled(false)
    setRect(startRect ?? endRect)
    window.setTimeout(onClose, 380)
  }

  return (
    <div
      className="about-video-backdrop"
      data-visible={settled}
      onClick={handleClose}
    >
      <div
        className="about-video-frame"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="about-video-close"
          onClick={handleClose}
          aria-label="Close video"
          autoFocus
        >
          ×
        </button>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={caption}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}

/**
 * The arrows and the video hotspot, drawn over the canvas rather than inside
 * the standard exhibit panel — same reasoning as `ResumeChrome.tsx`. The
 * video hotspot sits exactly on top of the drawn clipping on the page
 * itself (see `VIDEO_HOTSPOT` above) rather than behind a separate "Watch"
 * button, so the video reads as playable right there in the scrapbook.
 * Everything here is `pointer-events: none` except its own controls, and
 * sits below `FocusExit`'s z-index of 5 — except the expanded player, which
 * sits above it (`AboutChrome.css`): while a video is open it is the
 * topmost layer on purpose, with its own explicit close controls, rather
 * than leaving the exhibit's back button reachable behind it. `.about-chrome`
 * is `position: fixed` with its own z-index, which forms a stacking
 * context — so the player is rendered as a *sibling* of it, not a child,
 * letting its z-index resolve in the root stacking context where it can
 * actually outrank `FocusExit` instead of being trapped underneath it.
 */
export function AboutChrome() {
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const spread = useAboutBook((s) => s.spread)
  const turning = useAboutBook((s) => s.turning)
  const turn = useAboutBook((s) => s.turn)

  const hotspotRef = useRef<HTMLButtonElement>(null)
  const [startRect, setStartRect] = useState<PixelRect | null>(null)
  const [expanded, setExpanded] = useState(false)

  const isOpen = activeExhibitId === 'about'
  const atFirst = spread <= 0
  const atLast = spread >= ABOUT_SPREAD_COUNT - 1
  const midTurn = turning !== null
  const showVideoHotspot =
    spread === VIDEO_SPREAD && !midTurn && VIDEO_BLOCK !== undefined && VIDEO_HOTSPOT !== null

  // The player shouldn't persist into the next time the book is opened.
  useEffect(() => {
    if (!isOpen) {
      setExpanded(false)
      setStartRect(null)
    }
  }, [isOpen])

  // Arrow keys turn pages, mirroring `ResumeChrome.tsx`. Escape is
  // deliberately not handled here for the *book* — `FocusExit` owns that,
  // same as the resume book — see the separate capture-phase listener below
  // for why the *player* needs its own handling instead of racing it.
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
  // listener — so Escape closes the player before it can close the whole
  // exhibit, one level at a time, matching the rest of the app's back-out
  // behaviour. When the player isn't open this handler is a no-op and lets
  // the event through to FocusExit exactly as before.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !expanded) return
      event.stopPropagation()
      setExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isOpen, expanded])

  if (!isOpen) return null

  const openVideo = () => {
    const rect = hotspotRef.current?.getBoundingClientRect()
    setStartRect(rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null)
    setExpanded(true)
  }

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
        {showVideoHotspot && VIDEO_HOTSPOT && VIDEO_BLOCK && (
          <div className="about-stage">
            <div className="about-stage-spread">
              <button
                ref={hotspotRef}
                type="button"
                className="about-video-hotspot"
                style={{
                  left: `${VIDEO_HOTSPOT.xFrac * 100}%`,
                  top: `${VIDEO_HOTSPOT.yFrac * 100}%`,
                  width: `${VIDEO_HOTSPOT.wFrac * 100}%`,
                  height: `${VIDEO_HOTSPOT.hFrac * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${VIDEO_HOTSPOT.angleDeg}deg)`,
                }}
                onClick={openVideo}
                aria-label={`Play video: ${VIDEO_BLOCK.caption}`}
              />
            </div>
          </div>
        )}
      </div>
      {expanded && VIDEO_BLOCK && (
        <AboutVideoPlayer
          startRect={startRect}
          youtubeId={VIDEO_BLOCK.youtubeId}
          caption={VIDEO_BLOCK.caption}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}

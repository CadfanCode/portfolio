import { useCallback, useEffect } from 'react'
import { CAMERA_FOCUS } from './scene/cameraFocus'
import { useSceneStore } from './state/useSceneStore'
import './FocusExit.css'

/**
 * The way back out of a close-up: a return arrow, top left.
 *
 * DOM rather than a 3D marker, and top left rather than anywhere in the scene,
 * because inside a close-up the camera is locked — there is no looking around
 * to find a way out, so the way out cannot be somewhere you might have to look.
 * It is also the only control on screen at that moment, which is what makes the
 * corner the right place for it: it is where a back button lives everywhere
 * else, and a visitor who is now nose-to-nose with a safe should not have to
 * learn anything new to leave.
 *
 * Escape does the same thing. Anyone who has been put inside a modal view by a
 * click will try it.
 */
export function FocusExit() {
  const focus = useSceneStore((s) => s.focus)
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const closeExhibit = useSceneStore((s) => s.closeExhibit)
  const clearFocus = useSceneStore((s) => s.clearFocus)

  // "Back" steps out one level at a time: an open exhibit closes first,
  // leaving the close-up it lives inside still framed; only then does the
  // same button walk the camera back out to the stop.
  const goBack = useCallback(
    () => (activeExhibitId ? closeExhibit() : clearFocus()),
    [activeExhibitId, closeExhibit, clearFocus],
  )

  // Above the early return, so hook order stays stable when nothing is open.
  useEffect(() => {
    if (!focus) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focus, goBack])

  if (!focus) return null

  const view = CAMERA_FOCUS[focus]
  const label = view ? `Back from ${view.label.toLowerCase()}` : 'Back'

  return (
    <button
      type="button"
      className="focus-exit"
      onClick={goBack}
      // Never disabled, and that is a correctness fix rather than a nicety. A
      // disabled button does not swallow the click — Chrome passes it through
      // to whatever is beneath, which here is the Canvas, so pressing back
      // during the walk-in used to raycast into the scene and could trigger
      // whatever happened to be under the cursor. Pressing it early now simply
      // turns the camera round; `clearFocus` is safe to call mid-flight.
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15 5 8 12l7 7" />
      </svg>
      <span>Back</span>
    </button>
  )
}

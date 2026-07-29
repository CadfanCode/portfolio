import { useCallback, useEffect } from 'react'
import { CAMERA_FOCUS } from './scene/cameraFocus'
import type { SceneState } from './state/useSceneStore'
import { useSceneStore } from './state/useSceneStore'
import './FocusExit.css'

/**
 * Which stop each stop steps back to. Only stops listed here get a back
 * button at the scene level (i.e. with no close-up open). `cabin` is
 * deliberately absent: the companionway hotspot in `CabinHatch.tsx` already
 * walks the visitor back up to the cockpit, and a second, competing back
 * affordance there would just be noise.
 */
const SCENE_BACK: Partial<Record<SceneState, SceneState>> = { cockpit: 'ocean' }

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
 *
 * The same button also does double duty one level up: at a stop that has a
 * declared way back (currently just the cockpit, out to the open-ocean orbit)
 * with nothing else open, it steps the camera back along the locked path
 * instead of out of a close-up. Escape is deliberately not bound for that
 * case — leaving a close-up is a modal-dismiss gesture, but sitting at a
 * stop is not a modal state, so the keyboard shortcut stays scoped to focus.
 */
export function FocusExit() {
  const focus = useSceneStore((s) => s.focus)
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const scene = useSceneStore((s) => s.scene)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const closeExhibit = useSceneStore((s) => s.closeExhibit)
  const clearFocus = useSceneStore((s) => s.clearFocus)
  const goTo = useSceneStore((s) => s.goTo)

  const sceneBackTarget = SCENE_BACK[scene]

  // "Back" steps out one level at a time: an open exhibit closes first,
  // leaving the close-up it lives inside still framed; only then does the
  // same button walk the camera back out to the stop. With no close-up open
  // at all, "back" instead means the stop-level step declared in
  // `SCENE_BACK`, if this stop has one.
  const goBack = useCallback(() => {
    if (activeExhibitId) {
      closeExhibit()
    } else if (focus) {
      clearFocus()
    } else if (sceneBackTarget) {
      goTo(sceneBackTarget)
    }
  }, [activeExhibitId, closeExhibit, focus, clearFocus, sceneBackTarget, goTo])

  // Above the early return, so hook order stays stable when nothing is open.
  useEffect(() => {
    if (!focus) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focus, goBack])

  const showSceneBack = !focus && !activeExhibitId && !isTransitioning && sceneBackTarget

  if (!focus && !showSceneBack) return null

  const view = focus ? CAMERA_FOCUS[focus] : undefined
  const label = focus
    ? view
      ? `Back from ${view.label.toLowerCase()}`
      : 'Back'
    : 'Back to the water'

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

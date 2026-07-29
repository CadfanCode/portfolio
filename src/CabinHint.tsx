import { useEffect } from 'react'
import { useSceneStore } from './state/useSceneStore'
import { useCabinHint, HINT_VISIBLE_MS, ATTRACT_DELAY_MS } from './state/useCabinHint'
import './CabinHint.css'

/** Copy for the arrival nudge. Written the way you'd actually say it showing
 *  someone round the boat, not as marketing copy — and "starboard shelf"
 *  because a direction is the one thing that makes this worth reading. */
const HINT_TEXT =
  "There's a shelf of books to starboard, if you fancy a look — one of them isn't just for show."

export function CabinHint() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const showHint = useCabinHint((s) => s.showHint)
  const dismissHint = useCabinHint((s) => s.dismissHint)
  const startAttract = useCabinHint((s) => s.startAttract)
  const leaveCabin = useCabinHint((s) => s.leaveCabin)
  const noteBooksOpened = useCabinHint((s) => s.noteBooksOpened)
  const hintVisible = useCabinHint((s) => s.hintVisible)

  // Keyed only on `inCabin`, not on `isTransitioning`: `focusOn`/`clearFocus`
  // both flip `isTransitioning` too, so keying on it would re-arm both timers
  // every time the visitor opens or closes a close-up while in the cabin —
  // including the books close-up itself, which would restart the very timer
  // its own opening is meant to cancel.
  const inCabin = scene === 'cabin'

  useEffect(() => {
    if (!inCabin) return

    showHint()
    const hideTimer = window.setTimeout(dismissHint, HINT_VISIBLE_MS)
    const attractTimer = window.setTimeout(startAttract, ATTRACT_DELAY_MS)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(attractTimer)
      leaveCabin()
    }
  }, [inCabin, showHint, dismissHint, startAttract, leaveCabin])

  useEffect(() => {
    if (focus === 'books') noteBooksOpened()
  }, [focus, noteBooksOpened])

  // A message floating over a close-up is clutter, so it only ever shows at
  // the cabin stop itself, never while looking at something up close.
  if (!hintVisible || focus) return null

  return (
    // The fade *out* is the tail of one animation whose whole length is the
    // hint's own lifetime, rather than a second timer or an exit-transition
    // state: by the time this unmounts at `HINT_VISIBLE_MS` the keyframes
    // have already taken it to zero, so the removal is invisible. Driving the
    // duration from the same constant that schedules the unmount is what
    // keeps the two from drifting apart.
    <div
      className="cabin-hint"
      style={{ animationDuration: `${HINT_VISIBLE_MS}ms` }}
      role="status"
      aria-live="polite"
    >
      {HINT_TEXT}
    </div>
  )
}

import { useSceneStore } from '../state/useSceneStore'
import { useParrotStore } from './useParrotStore'
import { PARROT_NAME } from '../content/parrot'
import './ParrotChrome.css'

/**
 * Skipper's below-decks voice: the cabin's own DOM hint box. The chat panel
 * used to live here too, but it's now an in-world balloon anchored to the
 * bird (see `ParrotAssistant.tsx`), so this component is down to the one
 * piece of chrome that has nowhere in the scene to attach to.
 */
export function ParrotChrome() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const bubble = useParrotStore((s) => s.bubble)

  // Same guard `CabinHint.tsx` used: nothing floats over a close-up, and
  // this is the cabin's own voice, so it only shows at the cabin stop.
  const showHint = scene === 'cabin' && bubble !== null && focus === null

  if (!showHint) return null

  return (
    <div className="parrot-chrome" role="status" aria-live="polite">
      <span className="parrot-chrome-name">{PARROT_NAME}</span>
      {bubble}
    </div>
  )
}

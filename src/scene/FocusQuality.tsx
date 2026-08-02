import { useEffect } from 'react'
import { useQualityStore } from '../state/useQualityStore'
import { useSceneStore } from '../state/useSceneStore'

/**
 * Switches the Canvas over to the close-up DPR budget for as long as a
 * `focus` is open. Renders nothing; it exists purely to push `focus` into
 * `useQualityStore.closeUp`, which `SceneCanvas` reads through
 * `selectDprCeiling`.
 *
 * Keyed on `focus !== null` alone — not on `isTransitioning`, and not fired
 * from `arrive()` once the camera has settled. That is deliberate: setting it
 * on entry means the DPR bump lands, and the framebuffer resize that comes
 * with it, while the camera is still flying into the close-up. The resize
 * hitch is real either way, but hidden inside a transition it is invisible;
 * landing it after the camera has already stopped would put a visible stutter
 * on an otherwise-still frame, which is the one moment a close-up cannot
 * afford it.
 */
export function FocusQuality() {
  const focus = useSceneStore((s) => s.focus)
  const setCloseUp = useQualityStore((s) => s.setCloseUp)

  useEffect(() => {
    setCloseUp(focus !== null)
  }, [focus, setCloseUp])

  return null
}

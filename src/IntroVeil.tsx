import { useEffect, useRef, useState } from 'react'
import { useSceneStore } from './state/useSceneStore'
import './IntroVeil.css'

/** Matches the CSS transition duration, so the unmount waits for the fade. */
const FADE_MS = 1100

/**
 * A plain DOM veil over the whole page, opaque while `intro === 'pending'`.
 *
 * `<Suspense fallback={null}>` around `PortfolioWorld` means the visitor stares
 * at a blank canvas while the boat's GLB downloads — this is what they see
 * instead, so the shot opens on white rather than on nothing. Once the intro
 * leaves `'pending'` (the rig has mounted and the flight, or the reduced-
 * motion skip, has taken over) it fades and then stops rendering entirely,
 * handing off to `IntroClouds`' own whiteout quad for the rest of the descent.
 */
export function IntroVeil() {
  const intro = useSceneStore((s) => s.intro)
  const [mounted, setMounted] = useState(true)
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (intro === 'pending') return
    timeout.current = setTimeout(() => setMounted(false), FADE_MS)
    return () => clearTimeout(timeout.current)
  }, [intro])

  if (!mounted) return null

  return <div className="intro-veil" style={{ opacity: intro === 'pending' ? 1 : 0 }} />
}

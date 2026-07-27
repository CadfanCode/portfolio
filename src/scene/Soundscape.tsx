import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useAudioStore } from '../state/useAudioStore'
import { useSceneStore } from '../state/useSceneStore'
import { createSoundscape } from './audio/soundscape'
import type { Soundscape as Graph } from './audio/soundscape'

/**
 * Owns the audio graph and feeds it the weather.
 *
 * Inside the Canvas so it can share `useFrame`'s clock. That is not a
 * convenience: `sampleConditions` is a pure function of elapsed time, and the
 * sound is only guaranteed to agree with the sea, the heel and the sails
 * because all of them are asking the same clock for the same instant. Given its
 * own timer it would drift a frame at a time and eventually be describing a
 * different day.
 *
 * Renders nothing — it is a behaviour, and it lives in the tree so that
 * mounting and unmounting the world starts and stops the sound.
 */

/** Updates a second. The graph eases every parameter with `setTargetAtTime`, so
 *  it interpolates between these on its own; running it at frame rate would be
 *  sixty times the work for a signal whose fastest component (the gust) takes
 *  seconds to move. */
const RATE = 12

export function Soundscape() {
  const enabled = useAudioStore((s) => s.enabled)
  const setBlocked = useAudioStore((s) => s.setBlocked)
  const scene = useSceneStore((s) => s.scene)
  const exhibitOpen = useSceneStore((s) => s.activeExhibitId !== null)

  const graph = useRef<Graph | null>(null)
  const next = useRef(0)

  // Build once and keep it. Toggling mute suspends and resumes the context
  // rather than tearing the graph down: an AudioContext is a real audio device
  // and rebuilding one on every click is both slow and, on some browsers, a
  // way to run out of them.
  useEffect(() => {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    const ctx = new Ctor()
    graph.current = createSoundscape(ctx)
    setBlocked(ctx.state !== 'running')

    // Autoplay policy: nothing sounds until the page has been interacted with.
    // Any gesture will do, and the first one here is the click that comes
    // aboard, so this almost never costs the visitor a separate action.
    const unlock = () => {
      void ctx.resume().then(() => setBlocked(ctx.state !== 'running'))
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const event of events) window.addEventListener(event, unlock, { passive: true })

    // A scene nobody is looking at should not be a scene anybody can hear.
    const onVisibility = () => {
      if (document.hidden) void ctx.suspend()
      else if (useAudioStore.getState().enabled) void ctx.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      for (const event of events) window.removeEventListener(event, unlock)
      document.removeEventListener('visibilitychange', onVisibility)
      graph.current?.dispose()
      graph.current = null
      void ctx.close()
    }
  }, [setBlocked])

  useEffect(() => {
    const ctx = graph.current?.context
    if (!ctx) return
    if (enabled) void ctx.resume().then(() => setBlocked(ctx.state !== 'running'))
    else void ctx.suspend()
  }, [enabled, setBlocked])

  useFrame((state) => {
    const current = graph.current
    if (!current || !enabled) return

    const t = state.clock.elapsedTime
    if (t < next.current) return
    next.current = t + 1 / RATE

    current.update(t, scene, exhibitOpen)
  })

  return null
}

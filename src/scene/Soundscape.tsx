import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { useAudioStore } from '../state/useAudioStore'
import { useSceneStore } from '../state/useSceneStore'
import { getSoundscape } from './audio/engine'

/**
 * Feeds the weather to the audio graph.
 *
 * It does not own the graph — `audio/engine.ts` does, and has already built it
 * by the time this mounts, because this component sits behind the GLB's
 * Suspense boundary and the sound must not. All that is left here is the one
 * thing that genuinely needs to be inside the Canvas: the clock.
 *
 * `sampleConditions` is a pure function of elapsed time, and the sound is only
 * guaranteed to agree with the sea, the heel and the sails because all of them
 * are asking `useFrame`'s clock for the same instant. Given its own timer the
 * soundscape would drift a frame at a time and eventually be describing a
 * different day — which is why the *driving* stays here even though the graph
 * moved out.
 *
 * Renders nothing. Mounting it is what brings the sound up, and it mounts with
 * the world, so the two arrive together.
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

  // Claim the warm graph on the first render. `useState`'s initialiser rather
  // than an effect, so `useFrame` below has it on the very first frame — an
  // effect would cost a frame of silence, which is the whole thing this is
  // trying to avoid. Warm, this is a pointer read; cold (if `warmSoundscape`
  // never ran) it builds the graph, which still beats waiting for an effect.
  const [graph] = useState(getSoundscape)
  const next = useRef(0)

  useEffect(() => {
    const ctx = graph?.context
    if (!ctx) return
    if (enabled) void ctx.resume().then(() => setBlocked(ctx.state !== 'running'))
    else void ctx.suspend()
  }, [enabled, graph, setBlocked])

  useFrame((state) => {
    if (!graph || !enabled) return

    const t = state.clock.elapsedTime
    if (t < next.current) return
    next.current = t + 1 / RATE

    graph.update(t, scene, exhibitOpen)
  })

  return null
}

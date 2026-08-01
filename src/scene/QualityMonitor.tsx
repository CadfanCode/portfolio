import { PerformanceMonitor } from '@react-three/drei'
import { useSceneStore } from '../state/useSceneStore'
import { useQualityStore } from '../state/useQualityStore'

/**
 * Catches the machines that pass detection and still stutter.
 *
 * `quality.ts` guesses a tier from what the driver is willing to admit about
 * itself, which is a coarse instrument — a throttled laptop, a browser sharing a
 * GPU with thirty other tabs, or simply a card the regexes have never heard of
 * will all sail through it. This watches the frame rate that actually results and
 * trims the device pixel ratio until it fits.
 *
 * Deliberately the *only* thing that adapts at runtime. Stepping the whole tier
 * down would mean recreating the effect composer, rebuilding the ocean geometry
 * and recompiling materials — a visible hitch, in exchange for a decision that
 * could turn out to be wrong two seconds later when the transient passes. DPR is
 * the opposite: it is the biggest single lever in the scene, three.js resizes
 * into it cheaply, and being wrong about it for a moment costs nothing but
 * sharpness. So the tier stays put and this moves the resolution.
 */
export function QualityMonitor() {
  const intro = useSceneStore((s) => s.intro)
  const setDprScale = useQualityStore((s) => s.setDprScale)

  // Not while the intro is flying. Those seven seconds are deliberately the
  // heaviest frames in the app — seven layers of volumetric cloud over the whole
  // sea — and they are not representative of anything that follows. Letting them
  // drive the DPR to the floor would leave a perfectly capable machine at half
  // resolution for the rest of a visit. Mounting only once the intro is done also
  // means the monitor's first measurements are of the scene proper.
  if (intro !== 'done') return null

  return (
    <PerformanceMonitor
      ms={250}
      iterations={6}
      step={0.1}
      // Three consecutive reversals means the frame rate is straddling the
      // target rather than sitting on one side of it; that is the signal to stop
      // hunting and take the floor.
      flipflops={3}
      // A 120 Hz display that renders at 60 is fine; the same 60 on a 60 Hz
      // display is not. Bounds have to be read against the refresh rate or every
      // high-refresh machine reads as failing.
      bounds={(refreshrate) => (refreshrate > 90 ? [50, 90] : [45, 60])}
      // Pushed through the store rather than R3F's imperative `setDpr`, and this
      // is load-bearing: the Canvas re-applies every one of its props inside an
      // effect that has no dependency array, so an imperative DPR is silently
      // reverted the next time anything re-renders the Canvas. With the store
      // owning it, that re-application is a no-op instead of a regression. The
      // store also quantises, so this fires far less often than it is called.
      onChange={({ factor }) => setDprScale(0.5 + factor * 0.5)}
      onFallback={() => setDprScale(0.5)}
    />
  )
}

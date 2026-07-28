import { useAudioStore } from '../../state/useAudioStore'
import { createSoundscape } from './soundscape'
import type { Soundscape } from './soundscape'

/**
 * Owns the one audio graph for the page's whole life, and — the reason this
 * file exists at all — builds it *early*.
 *
 * ## Why the graph does not belong to a component
 *
 * It used to. `Soundscape.tsx` created the AudioContext in a mount effect, and
 * that put the entire soundscape behind the `<Suspense>` boundary in `App.tsx`,
 * because `Soundscape` renders inside `PortfolioWorld` and `PortfolioWorld`
 * suspends on a 6.9 MB GLB. Nothing about the audio needed the boat; it simply
 * sat in the same subtree. So the running order on a cold load was:
 *
 *   download and parse 6.9 MB of GLB   ~seconds
 *   mount, and only now construct the AudioContext
 *   generate 22 seconds of noise       ~45 ms on the main thread, blocking
 *   ease every gain up from zero       ~1 s of `setTargetAtTime`
 *
 * — which is heard as the boat arriving in silence and the sea fading in behind
 * it. Every one of those three costs is paid after the picture is ready, and
 * none of them had to be.
 *
 * Hoisting the graph here fixes all three. `warmSoundscape` is called from
 * `main.tsx`, so the context and the noise buffers are built while the GLB is
 * still in flight — the main thread is idle waiting on the network, which is
 * exactly when 45 ms of buffer generation is free. Every voice is constructed
 * at a gain of zero, so a warm graph is a silent one: it makes no sound until
 * the scene mounts and calls `update`, and that first update snaps rather than
 * eases (see `soundscape.ts`). The sea is at full weather-correct level on the
 * first frame the boat is visible.
 *
 * ## Lifetime
 *
 * One context, created once, never closed. That is not laziness about cleanup:
 *
 *   - an AudioContext is a real audio device, browsers cap how many a page may
 *     have, and the old mount effect closed and rebuilt one on every remount;
 *   - React `StrictMode` (which `main.tsx` uses) double-invokes mount effects in
 *     development, so that path built, tore down and rebuilt the graph — 90 ms
 *     of noise generation and two devices — on every single edit;
 *   - and the whole point of warming is that the graph outlives the React tree
 *     that happens to be driving it.
 *
 * Mute suspends and resumes the context rather than tearing anything down. The
 * only real teardown is the HMR hook at the bottom, so a long dev session does
 * not accumulate a context per reload.
 */

let instance: Soundscape | null = null

/**
 * Build the graph if it does not exist yet, and return it. Idempotent and safe
 * to call from anywhere; the first caller pays the ~45 ms, everyone after gets
 * the same object.
 *
 * Returns null only where there is no Web Audio at all — every voice here is
 * synthesised, so without it there is nothing to fall back to and the scene is
 * simply silent.
 */
export function getSoundscape(): Soundscape | null {
  if (instance) return instance

  const Ctor =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  const ctx = new Ctor()
  instance = createSoundscape(ctx)
  useAudioStore.getState().setBlocked(ctx.state !== 'running')

  // Autoplay policy: nothing sounds until the page has been interacted with.
  // Any gesture will do, and the first one here is the click that comes aboard,
  // so this almost never costs the visitor a separate action. Listening from
  // boot rather than from mount means a visitor who clicks *while the boat is
  // still loading* has already paid for the gesture by the time it arrives.
  const events = ['pointerdown', 'keydown', 'touchstart'] as const
  const unlock = () => {
    if (!useAudioStore.getState().enabled) return
    void ctx.resume().then(() => {
      useAudioStore.getState().setBlocked(ctx.state !== 'running')
      // Once the context has actually started, the policy is satisfied for
      // good and these have nothing left to do but allocate a promise on every
      // click for the rest of the session.
      if (ctx.state === 'running') {
        for (const event of events) window.removeEventListener(event, unlock)
      }
    })
  }
  for (const event of events) window.addEventListener(event, unlock, { passive: true })

  // A scene nobody is looking at should not be a scene anybody can hear.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend()
    else if (useAudioStore.getState().enabled) void ctx.resume()
  })

  return instance
}

/**
 * Start building the graph, off the critical path.
 *
 * Deferred by a macrotask rather than run inline: 45 ms of noise generation
 * during module evaluation would sit in front of React's first render and the
 * Canvas's WebGL context creation. A `setTimeout` puts it just after, while the
 * GLB fetch — already kicked off by `useGLTF.preload` in `Boat.tsx`, which runs
 * at import time — has the network to itself and the main thread is otherwise
 * doing nothing. Seconds of headroom against 45 ms of work.
 */
export function warmSoundscape(): void {
  if (instance) return
  window.setTimeout(getSoundscape, 0)
}

// Dev only: Vite replaces the module on edit, which would otherwise strand this
// context — and its device — with no reference left to close it.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    instance?.dispose()
    void instance?.context.close()
    instance = null
  })
}

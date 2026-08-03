import { matchScripted, pickFallback } from '../../content/parrot'
import type { SceneState } from '../../state/useSceneStore'
import type { ParrotBrain, Turn } from './types'

/** How long each streamed chunk sits on screen before the next one appears —
 *  small enough to read as speech typing out, not so small it costs a timer
 *  firing every frame. */
const CHUNK_DELAY_MS = 18

/** How many characters land per chunk. A handful at a time rather than one,
 *  since a parrot with a script should sound quick, not laboured. */
const CHUNK_SIZE = 3

/** `setTimeout` wrapped as a promise that also resolves early if `signal` is
 *  already aborted by the time it's awaited — the loop below checks the
 *  signal between chunks too, but this covers the case where cancellation
 *  lands while a delay is already in flight. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * The default brain: no model, no network, just `content/parrot.ts`'s
 * keyword-matched answers, typed out a few characters at a time so the panel
 * reads as a bird talking rather than a block of text appearing whole.
 *
 * `history` is accepted to satisfy `ParrotBrain` — a scripted brain has no
 * use for prior turns, since it has no memory beyond the current question —
 * but a later brain (WebLLM, behind the same interface) will want it for
 * context, which is why the shape is there already. `scene` it does use,
 * passing it straight through to `matchScripted` — the cockpit's talkative
 * aside lives in `content/parrot.ts`, not here, since this brain has no
 * scene-conditioned behaviour of its own.
 */
export const scriptedBrain: ParrotBrain = {
  id: 'scripted',
  label: "ship's memory",

  async *ask(question: string, _history: readonly Turn[], scene: SceneState): AsyncIterable<string> {
    const answer = matchScripted(question, scene) ?? pickFallback()

    // An AbortController tied to this generator's own lifetime, not passed
    // in: `for await...of` calling `.return()` on early exit (the consumer
    // stopping iteration — see `askParrot`'s early-return paths) is the
    // signal to stop scheduling further chunks. Without this, closing the
    // chat mid-answer would leave a chain of timeouts firing into a
    // component that no longer cares.
    const controller = new AbortController()
    try {
      for (let i = 0; i < answer.length; i += CHUNK_SIZE) {
        await delay(CHUNK_DELAY_MS, controller.signal)
        if (controller.signal.aborted) return
        yield answer.slice(i, i + CHUNK_SIZE)
      }
    } finally {
      controller.abort()
    }
  },
}

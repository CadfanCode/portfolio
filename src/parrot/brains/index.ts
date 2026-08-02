import { scriptedBrain } from './scripted'
import type { ParrotBrain } from './types'

export type { ParrotBrain, Turn } from './types'

/**
 * The brain currently answering the chat panel, held as module state rather
 * than imported directly by `useParrotStore`. That indirection is the whole
 * point: a later task swaps this for a WebLLM brain behind the identical
 * `ParrotBrain` interface, and the store, the panel and this file's own
 * `getBrain` caller never need to change to pick it up — only whatever calls
 * `setBrain` once the model is ready does.
 */
let currentBrain: ParrotBrain = scriptedBrain

/** Swaps the active brain. Exported for whatever loads a heavier brain later
 *  (and for tests); nothing in this task calls it with anything but the
 *  default. */
export function setBrain(brain: ParrotBrain): void {
  currentBrain = brain
}

export function getBrain(): ParrotBrain {
  return currentBrain
}

import type { SceneState } from '../../state/useSceneStore'

/**
 * One line of the chat transcript. `role` names who said it rather than
 * "user"/"assistant" — this panel is in character as a conversation with a
 * ship's parrot, not a generic chat widget, and the copy throughout should
 * read that way too.
 */
export type Turn = { role: 'visitor' | 'parrot'; text: string }

/**
 * The seam between the chat panel and whatever is actually answering.
 *
 * `useParrotStore` talks to this interface only — it never imports a brain
 * directly, so swapping the scripted brain for a WebLLM one later is a
 * one-line change at `brains/index.ts`, not a change to the store or the
 * panel. See `scripted.ts` for the only implementation that exists today.
 */
export interface ParrotBrain {
  readonly id: string
  /** Human-readable, shown in the panel footer, e.g. "ship's memory". */
  readonly label: string
  /** Streams the answer in fragments so the panel can render progressively.
   *  `scene` is where the visitor currently is — the cockpit gets a more
   *  talkative, comical Polly, and a brain needs to know it is there to lean
   *  into that. */
  ask(question: string, history: readonly Turn[], scene: SceneState): AsyncIterable<string>
}

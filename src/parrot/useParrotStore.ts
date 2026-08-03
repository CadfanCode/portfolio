import { create } from 'zustand'
import { getBrain, setBrain } from './brains'
import type { Turn } from './brains/types'
import { resolveBrainTier, type BrainTier } from './brainTier'
import { PARROT_HINTS } from '../content/parrot'
import { useSceneStore, type SceneState } from '../state/useSceneStore'

/** Length of one on/off cycle within an attract burst, in milliseconds —
 *  shared between `ParrotAssistant.tsx`'s scheduler (which times a burst as
 *  `ATTRACT_OSCILLATIONS_PER_BURST` of these back to back) and
 *  `BookSpines.tsx`'s per-frame pulse (which phases its sine wave off this
 *  same period), so the two stay in lockstep without either hardcoding the
 *  other's constant. */
export const ATTRACT_OSCILLATION_MS = 500

/** Oscillations per attract burst — see `ATTRACT_OSCILLATION_MS`. */
export const ATTRACT_OSCILLATIONS_PER_BURST = 4

type ParrotStore = {
  /** True while the book-spine blink is in its on-phase — toggled on and off
   *  in discrete steps by `ParrotAssistant.tsx`'s blink sequence, not held
   *  continuously true, so `BookSpines.tsx` only has to damp toward whichever
   *  binary target this is this frame. */
  attracting: boolean
  /**
   * True once the visitor has opened the books close-up, once, ever. Sticky
   * for the life of the tab rather than per-visit: a nudge is for someone who
   * hasn't found the shelf yet, and re-arming it every time they leave and
   * come back to the cabin would nag someone who already has.
   */
  booksSeen: boolean

  /** Starts a blink's on-phase. No-ops if the books have already been found —
   *  they don't need drawing to something they've already seen. */
  startAttract: () => void
  /** Ends a blink's on-phase, letting the spines damp back to rest between
   *  flashes. Unlike `startAttract`, not gated on `booksSeen`: the caller's
   *  own timer chain already stops scheduling once the books are seen, so
   *  this only ever runs as the second half of a blink that was allowed to
   *  start. */
  stopAttract: () => void
  /** Marks the books found and clears the attract nudge for good. */
  noteBooksOpened: () => void
  /** Clears the attract nudge on leaving a scene — `booksSeen`, `hintedScenes`
   *  and `inputOpen` all stay, since they're per-tab, not per-visit. */
  leaveScene: () => void

  // --- Chat --------------------------------------------------------------
  //
  // The click-to-open panel now carries the hint too: opening it for the
  // first time at a given stop speaks that stop's `PARROT_HINTS` line as the
  // first transcript turn (see `openChat`), so there is only ever one place
  // Polly's voice comes from.

  /** Whether the DOM chat panel (`ParrotChat.tsx`) is on screen. */
  chatOpen: boolean
  /** Which stops have already had their hint line appended to `history`.
   *  Sticky for the life of the tab, same as `booksSeen` — reopening the
   *  panel at a stop you've already heard from shouldn't repeat itself. */
  hintedScenes: SceneState[]
  /** Whether the text-input form is showing, as opposed to the collapsed
   *  "Ask something back" button. Sticky for the tab: once a visitor knows
   *  they can talk back, re-collapsing it on every reopen would just be
   *  friction for no reason. */
  inputOpen: boolean
  /** Reveals the input, permanently for the tab. */
  revealInput: () => void
  /** The conversation so far, oldest first. Cleared on nothing — it persists
   *  for the life of the tab, same as `booksSeen`, so closing and reopening
   *  the panel doesn't lose what was already said. */
  history: Turn[]
  /** True while a brain is mid-`ask()`, i.e. from the moment a question is
   *  sent until its answer is fully committed to `history`. */
  pending: boolean
  /** The answer as it streams in, chunk by chunk, before it's committed as a
   *  `history` turn. Separate from `history` rather than pushing a
   *  continuously-mutated last entry, so the transcript's own turns are
   *  always either fully said or not there yet — nothing in between for a
   *  consumer to render specially. */
  draft: string

  /**
   * Opens the panel for the given stop. The first time a stop is opened, its
   * `PARROT_HINTS` line is appended as a `{ role: 'parrot' }` turn before
   * anything else happens — that's the hint, now indistinguishable from any
   * other message in the transcript. Every later open at the same stop is a
   * no-op against `hintedScenes`, so the line is never repeated.
   */
  openChat: (scene: SceneState) => void
  closeChat: () => void
  /** Fired by ParrotAssistant's weather watch when the sky crosses into a named
   *  condition worth a comment. Unlike openChat, this never touches
   *  hintedScenes — it's not a stop hint, it can fire again on the next squall.
   *  Caller already guards against firing while the panel's open. */
  announceWeather: (line: string) => void
  /**
   * Sends a question to the current brain (`brains/index.ts`'s `getBrain`,
   * not a brain this store holds itself — see that module's own doc on why)
   * and streams the answer into `draft` as it arrives, then commits it as a
   * `history` turn. The store never imports a brain directly: swapping the
   * scripted one for WebLLM later only touches `brains/index.ts`.
   */
  askParrot: (question: string) => Promise<void>

  // --- Model opt-in --------------------------------------------------------
  //
  // The scripted brain above is the only one that exists until a visitor
  // asks for more. This block is the machinery for that ask: whether the
  // upgrade is even offered (`brainTier`), and if so, the state of loading
  // it in (`modelState`/`modelProgress`/`modelStatus`).

  /**
   * Whether this session is even allowed to see the "teach Polly to talk
   * properly" button — `'unknown'` until `resolveBrainTier()` has settled,
   * so `ParrotChat.tsx` can render nothing rather than a flash of the wrong
   * answer while a WebGPU adapter query is in flight. Resolved once, lazily,
   * the first time the chat panel opens — see `openChat`.
   */
  brainTier: BrainTier | 'unknown'
  /** Where the opt-in model is in its lifecycle. `'absent'` is the default
   *  and the permanent state for anyone who never clicks the button, or
   *  whose hardware means the button is never shown at all. */
  modelState: 'absent' | 'loading' | 'ready' | 'failed'
  /** 0–1, driven by WebLLM's `initProgressCallback` while `modelState` is
   *  `'loading'`. Meaningless in every other state. */
  modelProgress: number
  /** Short human-readable status line alongside `modelProgress`, e.g.
   *  "Fetching model weights…" — taken verbatim from WebLLM's own report
   *  rather than paraphrased, since it already says the useful thing. */
  modelStatus: string

  /**
   * The opt-in itself. Loads `brains/webllm.ts`, wires its progress reports
   * into `modelProgress`/`modelStatus`, and on success swaps the active
   * brain via `setBrain` — after which every subsequent `askParrot` call
   * answers from the model (modulo its own per-question fallback to
   * scripted; see that module's own doc). Never called automatically: the
   * ~880 MB download only starts on an explicit click in `ParrotChat.tsx`.
   */
  enableModel: () => Promise<void>
}

export const useParrotStore = create<ParrotStore>((set, get) => ({
  attracting: false,
  booksSeen: false,

  startAttract: () =>
    set((state) => (state.booksSeen ? state : { attracting: true })),

  stopAttract: () => set({ attracting: false }),

  // Also closes the chat panel: once the books are open, a panel pointing at
  // them is stale (the panel exists in the cabin to point at the shelf).
  noteBooksOpened: () => set({ booksSeen: true, attracting: false, chatOpen: false }),

  leaveScene: () => set({ attracting: false, chatOpen: false }),

  chatOpen: false,
  hintedScenes: [],
  inputOpen: false,
  history: [],
  pending: false,
  draft: '',

  revealInput: () => set({ inputOpen: true }),

  openChat: (scene) => {
    set((state) => {
      if (state.hintedScenes.includes(scene)) return { chatOpen: true }
      return {
        chatOpen: true,
        hintedScenes: [...state.hintedScenes, scene],
        history: [...state.history, { role: 'parrot', text: PARROT_HINTS[scene] }],
      }
    })

    // Resolved lazily, on first open rather than at module load, so a
    // visitor who never opens the chat never triggers a WebGPU adapter
    // query at all. Only fires once: `brainTier` starts at `'unknown'` and
    // every open after the first is a no-op here.
    if (get().brainTier === 'unknown') {
      void resolveBrainTier().then((tier) => set({ brainTier: tier }))
    }
  },

  closeChat: () => set({ chatOpen: false }),

  announceWeather: (line) =>
    set((state) => ({
      chatOpen: true,
      history: [...state.history, { role: 'parrot', text: line }],
    })),

  askParrot: async (question) => {
    const trimmed = question.trim()
    if (!trimmed || get().pending) return

    // Snapshot the transcript *before* the new question joins it. `ask()` takes
    // the question and the prior history as two separate arguments, so passing
    // the post-push transcript would hand a context-aware brain the same
    // question twice — once as `question` and again as the tail of `history`.
    // The scripted brain ignores history entirely and would never have shown
    // this, which is exactly why it is worth getting right before one that
    // doesn't lands on the same seam.
    const historyForBrain = get().history

    set((state) => ({
      history: [...state.history, { role: 'visitor', text: trimmed }],
      pending: true,
      draft: '',
    }))

    const brain = getBrain()

    // Read imperatively rather than subscribed, same idiom as
    // `resolveBrainTier`/`getBrain` above — this store cares where the
    // visitor is only at the instant a question is asked, not on every scene
    // change, so there is nothing to subscribe to.
    const scene = useSceneStore.getState().scene

    let accumulated = ''
    for await (const chunk of brain.ask(trimmed, historyForBrain, scene)) {
      accumulated += chunk
      set({ draft: accumulated })
    }

    set((state) => ({
      history: [...state.history, { role: 'parrot', text: accumulated }],
      pending: false,
      draft: '',
    }))
  },

  brainTier: 'unknown',
  modelState: 'absent',
  modelProgress: 0,
  modelStatus: '',

  enableModel: async () => {
    // Guard against a double click firing this twice — the button is meant
    // to disable itself once `modelState` leaves `'absent'`, but a second
    // caller (e.g. a stray keyboard activation) would otherwise spin up a
    // second engine and worker for no benefit.
    if (get().modelState !== 'absent') return

    set({ modelState: 'loading', modelProgress: 0, modelStatus: 'Waking the parrot…' })

    try {
      const { createWebllmBrain } = await import('./brains/webllm')
      const brain = await createWebllmBrain({
        onProgress: (report) => {
          set({ modelProgress: report.progress, modelStatus: report.text })
        },
      })
      setBrain(brain)
      set({ modelState: 'ready', modelProgress: 1 })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[parrot] failed to load the model brain, staying scripted', error)
      }
      // The scripted brain was never swapped out, so the panel keeps
      // working exactly as it did before this was clicked — only the
      // footer's state changes to reflect the failed attempt.
      set({ modelState: 'failed' })
    }
  },
}))

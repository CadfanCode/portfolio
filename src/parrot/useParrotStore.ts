import { create } from 'zustand'
import { getBrain, setBrain } from './brains'
import type { Turn } from './brains/types'
import { resolveBrainTier, type BrainTier } from './brainTier'

/** How long a spoken line stays on screen before the parrot goes quiet again. */
export const HINT_VISIBLE_MS = 10_000
/** How long a visitor can sit in the cabin without opening the books before
 *  the spines start blinking to draw the eye. */
export const ATTRACT_DELAY_MS = 60_000

type ParrotStore = {
  /** The line the parrot is currently saying, or `null` while silent. Carries
   *  the actual text rather than a boolean, since the speaker (the in-world
   *  bubble on deck, or the DOM chrome below decks) changes with scene but
   *  the words don't — see `ParrotAssistant`. */
  bubble: string | null
  /** True once the attract-mode blink on the book spines should be running. */
  attracting: boolean
  /**
   * True once the visitor has opened the books close-up, once, ever. Sticky
   * for the life of the tab rather than per-visit: a nudge is for someone who
   * hasn't found the shelf yet, and re-arming it every time they leave and
   * come back to the cabin would nag someone who already has.
   */
  booksSeen: boolean

  /** Shows a line. No-ops for the books nudge's own purpose is left to the
   *  caller — this store just holds what's being said. */
  say: (line: string) => void
  hush: () => void
  /** Starts the blink. No-ops if the books have already been found — they
   *  don't need drawing to something they've already seen. */
  startAttract: () => void
  /** Marks the books found and clears both nudges for good. */
  noteBooksOpened: () => void
  /** Clears the two per-visit nudges on leaving a scene, but leaves
   *  `booksSeen` alone — see its own doc. */
  leaveScene: () => void

  // --- Chat --------------------------------------------------------------
  //
  // The click-to-open panel, layered on top of the hint system above rather
  // than replacing it: the hint bubble is a passive nudge that fires on
  // arrival, the chat is something the visitor asked for, and the two only
  // interact at the moment the chat opens (see `openChat`), never otherwise.

  /** Whether the DOM chat panel (`ParrotChat.tsx`) is on screen. */
  chatOpen: boolean
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

  openChat: () => void
  closeChat: () => void
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
   * Whether this session is even allowed to see the "teach Skipper to talk
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
  bubble: null,
  attracting: false,
  booksSeen: false,

  say: (line) => set({ bubble: line }),

  hush: () => set({ bubble: null }),

  startAttract: () =>
    set((state) => (state.booksSeen ? state : { attracting: true })),

  noteBooksOpened: () => set({ booksSeen: true, bubble: null, attracting: false }),

  // Also closes the chat balloon: it's anchored in-world to `PARROT_POSITION`
  // (see `ParrotAssistant.tsx`), so surviving a stop change would leave it
  // pointing at wherever the bird used to be, or nothing at all.
  leaveScene: () => set({ bubble: null, attracting: false, chatOpen: false }),

  chatOpen: false,
  history: [],
  pending: false,
  draft: '',

  openChat: () => {
    // Opening the chat is the visitor choosing to read something themselves;
    // the ambient hint bubble talking over that would just be noise, so it's
    // hushed here. Closing the chat does the reverse of nothing — there is
    // no line queued up to resume, and re-saying whatever the hint last said
    // would read as the parrot repeating itself for no reason.
    set({ chatOpen: true, bubble: null })

    // Resolved lazily, on first open rather than at module load, so a
    // visitor who never opens the chat never triggers a WebGPU adapter
    // query at all. Only fires once: `brainTier` starts at `'unknown'` and
    // every open after the first is a no-op here.
    if (get().brainTier === 'unknown') {
      void resolveBrainTier().then((tier) => set({ brainTier: tier }))
    }
  },

  closeChat: () => set({ chatOpen: false }),

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

    let accumulated = ''
    for await (const chunk of brain.ask(trimmed, historyForBrain)) {
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

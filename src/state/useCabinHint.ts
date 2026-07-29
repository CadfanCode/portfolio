import { create } from 'zustand'

/** How long the transient arrival message stays on screen. */
export const HINT_VISIBLE_MS = 10_000
/** How long a visitor can sit in the cabin without opening the books before
 *  the spines start blinking to draw the eye. */
export const ATTRACT_DELAY_MS = 60_000

type CabinHintStore = {
  /** True while the transient "look at the books" message is showing. */
  hintVisible: boolean
  /** True once the attract-mode blink on the book spines should be running. */
  attracting: boolean
  /**
   * True once the visitor has opened the books close-up, once, ever. Sticky
   * for the life of the tab rather than per-visit: a nudge is for someone who
   * hasn't found the shelf yet, and re-arming it every time they leave and
   * come back to the cabin would nag someone who already has.
   */
  booksSeen: boolean

  /** Shows the arrival hint. No-ops if the books have already been found. */
  showHint: () => void
  dismissHint: () => void
  /** Starts the blink. No-ops if the books have already been found — they
   *  don't need drawing to something they've already seen. */
  startAttract: () => void
  /** Marks the books found and clears both nudges for good. */
  noteBooksOpened: () => void
  /** Clears the two per-visit nudges on leaving the cabin, but leaves
   *  `booksSeen` alone — see its own doc. */
  leaveCabin: () => void
}

export const useCabinHint = create<CabinHintStore>((set, get) => ({
  hintVisible: false,
  attracting: false,
  booksSeen: false,

  showHint: () => {
    if (get().booksSeen) return
    set({ hintVisible: true })
  },

  dismissHint: () => set({ hintVisible: false }),

  startAttract: () => {
    if (get().booksSeen) return
    set({ attracting: true })
  },

  noteBooksOpened: () => set({ booksSeen: true, hintVisible: false, attracting: false }),

  leaveCabin: () => set({ hintVisible: false, attracting: false }),
}))

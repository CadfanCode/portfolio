import { create } from 'zustand'
import { RESUME_PAGES } from '../../../content/resume'

/** Four spreads (`title`+`summary`, `skills`+`experience-1`, …) out of the
 *  eight flat pages in `RESUME_PAGES` — see that module's own header. */
export const RESUME_SPREAD_COUNT = RESUME_PAGES.length / 2

export type TurnDirection = 'forward' | 'backward'

type ResumeBookStore = {
  /** Index of the spread currently at rest — 0..RESUME_SPREAD_COUNT - 1. */
  spread: number
  /** Which way a turn is in flight, or null when the book is at rest. The
   *  animation's own progress lives in a ref inside `ResumeBook`, not here —
   *  it runs every frame and would otherwise re-render the DOM chrome 60
   *  times a second for no reason. */
  turning: TurnDirection | null
  /** Starts a turn. No-ops at the ends of the book or mid-turn — the caller
   *  (arrow buttons, arrow keys) doesn't have to know either rule. */
  turn: (direction: TurnDirection) => void
  /** Called by `ResumeBook` once a turn's animation finishes. */
  finishTurn: () => void
  /** Back to the title spread, closed. Called when the exhibit closes, so
   *  reopening it doesn't resume mid-book. */
  reset: () => void
}

export const useResumeBook = create<ResumeBookStore>((set, get) => ({
  spread: 0,
  turning: null,

  turn: (direction) => {
    const { turning, spread } = get()
    if (turning) return
    if (direction === 'forward' && spread >= RESUME_SPREAD_COUNT - 1) return
    if (direction === 'backward' && spread <= 0) return
    set({ turning: direction })
  },

  finishTurn: () => {
    const { turning, spread } = get()
    if (!turning) return
    set({
      spread: turning === 'forward' ? spread + 1 : spread - 1,
      turning: null,
    })
  },

  reset: () => set({ spread: 0, turning: null }),
}))

import { create } from 'zustand'
import { ABOUT_PAGES } from '../../../content/about'

/** Five spreads out of the ten flat pages in `ABOUT_PAGES` — see that
 *  module's own header. */
export const ABOUT_SPREAD_COUNT = ABOUT_PAGES.length / 2

export type TurnDirection = 'forward' | 'backward'

type AboutBookStore = {
  /** Index of the spread currently at rest — 0..ABOUT_SPREAD_COUNT - 1. */
  spread: number
  /** Which way a turn is in flight, or null when the book is at rest. */
  turning: TurnDirection | null
  /** Starts a turn. No-ops at the ends of the book or mid-turn. */
  turn: (direction: TurnDirection) => void
  /** Called by `AboutBook` once a turn's animation finishes. */
  finishTurn: () => void
  /** Back to the title spread, closed. Called when the exhibit closes. */
  reset: () => void
}

export const useAboutBook = create<AboutBookStore>((set, get) => ({
  spread: 0,
  turning: null,

  turn: (direction) => {
    const { turning, spread } = get()
    if (turning) return
    if (direction === 'forward' && spread >= ABOUT_SPREAD_COUNT - 1) return
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

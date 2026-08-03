import { create } from 'zustand'

/**
 * A tiny, single-slot toast store for the handful of exhibit stand-ins that
 * are wired up (camera focus, click target) but have no real content behind
 * them yet — the chart table, the VHF, and any book with neither `exhibit`
 * nor `url`. Deliberately not folded into `useSceneStore`: this is UI chrome
 * reacting to a click, not part of the camera/exhibit state machine, so it
 * has no business living beside `focus`/`activeExhibitId`.
 */
type ComingSoonStore = {
  /** The toast's text, or `null` when nothing is showing. Single-slot rather
   *  than a queue — a second placeholder click while one toast is still up
   *  just restarts the same message, it doesn't stack. */
  message: string | null
  show: (message: string) => void
  clear: () => void
}

export const useComingSoonStore = create<ComingSoonStore>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}))

import { create } from 'zustand'

/**
 * Whether the scene is making any sound, and whether the browser has let it
 * start yet.
 *
 * A store of its own rather than a field on `useSceneStore`, which is about
 * where the camera is and what is open. Two things need this and they are on
 * opposite sides of the Canvas — the toggle button is DOM, the soundscape is
 * inside the render loop — so it wants the same treatment the scene state got
 * for the same reason.
 *
 * `blocked` exists because of autoplay policy, not because of taste. A browser
 * will not start an AudioContext until the page has been interacted with, so
 * between load and the visitor's first click the scene is deliberately silent
 * and `enabled` is a lie. The toggle reads `blocked` so it can say "sound is
 * waiting for you" rather than showing itself as on over silence.
 */
type AudioStore = {
  /** What the visitor has asked for. */
  enabled: boolean
  /** True while the browser is holding the context suspended. */
  blocked: boolean
  toggle: () => void
  setBlocked: (blocked: boolean) => void
}

export const useAudioStore = create<AudioStore>((set) => ({
  // On by default. The first thing anyone does here is click the boat to come
  // aboard, and browsers will not let a note out before that click anyway — so
  // this is gesture-gated whatever it says, and a silent sailing scene that
  // needs to be switched on is a worse first impression than one that starts.
  // Flip this to `false` for opt-in.
  enabled: true,
  blocked: true,

  toggle: () => set((s) => ({ enabled: !s.enabled })),
  setBlocked: (blocked) => set({ blocked }),
}))

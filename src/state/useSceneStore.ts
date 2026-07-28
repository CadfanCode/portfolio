import { create } from 'zustand'

/** A stop on the authored camera path. */
export type SceneState = 'ocean' | 'cockpit' | 'cabin'

/**
 * Which stops are reachable from which. The path is locked, so this map is the
 * single definition of the route — add a stop here, not in the camera rig.
 */
export const SCENE_LINKS: Record<SceneState, readonly SceneState[]> = {
  ocean: ['cockpit'],
  cockpit: ['ocean', 'cabin'],
  cabin: ['cockpit'],
}

type SceneStore = {
  /** Where the camera is, or is heading if a transition is in flight. */
  scene: SceneState
  /** Stop being travelled from; null when idle. Lets the rig ease out of it. */
  from: SceneState | null
  /** True while the camera is moving. Input is ignored meanwhile. */
  isTransitioning: boolean
  /** Id of the open exhibit, or null. Ids stay opaque to the store. */
  activeExhibitId: string | null
  /**
   * Id of the close-up view the camera is in, or null when it is at the stop.
   * Ids stay opaque here the same way exhibit ids do; `cameraFocus.ts` owns
   * what they mean.
   *
   * A second axis rather than a fourth `SceneState`, because it is genuinely a
   * different kind of thing. A stop is a place you stand and look around from,
   * and the route between stops is `SCENE_LINKS`. A focus is a fixed framing of
   * one object, reachable only from its own stop and leaving only back to it —
   * so as a scene it would need three one-way link pairs, and every consumer
   * that asks "am I in the cabin?" would have to learn four new answers meaning
   * yes.
   */
  focus: string | null
  /**
   * The close-up the camera is on its way *out* of, or null.
   *
   * The rig needs this to retrace the approach in reverse, and it cannot keep
   * it itself. A ref would be the obvious home and is the wrong one: React's
   * StrictMode runs every effect twice in development — mount, clean up, mount
   * — so a ref written inside the effect body is already cleared by the time
   * the surviving run reads it, and the walk-out silently degrades to a
   * straight flight. Which is exactly the sort of bug that only appears in the
   * one build nobody ships. The store is outside React and is invoked once.
   */
  leaving: string | null

  /** Begin a move. No-ops if mid-flight or if the route doesn't allow it. */
  goTo: (next: SceneState) => void
  /** Called by CameraRig once the tween lands. */
  arrive: () => void
  openExhibit: (id: string) => void
  closeExhibit: () => void
  /** Fly to a close-up. No-ops mid-flight or if one is already open. */
  focusOn: (id: string) => void
  /** Fly back to the stop the focus belongs to. */
  clearFocus: () => void
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scene: 'ocean',
  from: null,
  isTransitioning: false,
  activeExhibitId: null,
  focus: null,
  leaving: null,

  goTo: (next) => {
    const { scene, isTransitioning } = get()
    if (isTransitioning || next === scene) return

    if (!SCENE_LINKS[scene].includes(next)) {
      if (import.meta.env.DEV) {
        console.warn(`[scene] no route from "${scene}" to "${next}"`)
      }
      return
    }

    set({
      from: scene,
      scene: next,
      isTransitioning: true,
      activeExhibitId: null,
      // Leaving a stop leaves any close-up of something at it. Cleared here
      // rather than left for the rig to notice, so there is never a frame in
      // which the store says the camera is reading the chart table on a boat it
      // has already left.
      focus: null,
      leaving: null,
    })
  },

  arrive: () => set({ from: null, isTransitioning: false }),

  openExhibit: (id) => {
    const { isTransitioning, focus } = get()
    if (isTransitioning || focus) return
    set({ activeExhibitId: id })
  },

  closeExhibit: () => set({ activeExhibitId: null }),

  focusOn: (id) => {
    const { isTransitioning, focus } = get()
    if (isTransitioning || focus === id) return
    set({ focus: id, leaving: null, isTransitioning: true, activeExhibitId: null })
  },

  clearFocus: () => {
    const { focus } = get()
    if (!focus) return
    // Deliberately *not* gated on `isTransitioning`, unlike everything else
    // here. Pressing back while the camera is still walking in is the most
    // natural thing a visitor does — they have seen enough — and refusing it
    // means the press does nothing, which reads as a broken button. The rig
    // cancels whatever leg is in flight and walks out from wherever it got to.
    set({ focus: null, leaving: focus, isTransitioning: true })
  },
}))

import { create } from 'zustand'
import { prefersReducedMotion } from '../scene/introFlight'

/** A stop on the authored camera path. */
export type SceneState = 'ocean' | 'cockpit' | 'cabin'

/**
 * Where the opening flight is. `'pending'` until `CameraRig` mounts (after the
 * GLB resolves out of Suspense). `'holding'` is the new film-titles beat: the
 * camera hangs near-level in the cloud tops while the title card fades in,
 * holds, and fades out. `'playing'` is the authored plummet down to the
 * cockpit (`INTRO_PATH`, unchanged). `'done'` forever after — there is no
 * going back to `'pending'` or `'holding'`, or replaying either.
 */
export type IntroPhase = 'pending' | 'holding' | 'playing' | 'done'

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
  /** Phase of the opening flight. See `IntroPhase`. */
  intro: IntroPhase

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
  /**
   * Called by `CameraRig` on mount, once the boat has loaded out of Suspense.
   * No-op unless `intro` is still `'pending'` — mount effects run twice under
   * React StrictMode, and the second run must not restart a flight already
   * under way. Moves to `'holding'`, not `'playing'` — the title card gets to
   * read before the camera commits to the plummet.
   *
   * `scene` stays `'ocean'` for the whole flight rather than jumping straight
   * to `'cockpit'`: `PortfolioWorld` only couples the boat to the sea once
   * `scene !== 'ocean'`, and leaving it at `'ocean'` is what lets the hull
   * rock in world space while the camera falls past it. `endIntro` is what
   * finally moves `scene` on.
   */
  beginIntro: () => void
  /**
   * Called by `CameraRig` when the hold beat lands — the camera has finished
   * drifting onto `INTRO_PATH[0]` and the tilt has handed the aim over to it.
   * No-op unless `intro` is still `'holding'`, so a stray second call (there
   * shouldn't be one, but nothing else enforces it) can't restart the flight
   * mid-plummet.
   */
  beginFlight: () => void
  /**
   * Called by `CameraRig` when the authored flight lands. Moves `scene` to
   * `'cockpit'` with `from: 'ocean'` so the rig's normal stop-arrival effect
   * runs once more, non-animated, and applies the cockpit's look constraints
   * — the handover from scripted flight to free-look happens there, not here.
   */
  endIntro: () => void
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scene: 'ocean',
  from: null,
  isTransitioning: false,
  activeExhibitId: null,
  focus: null,
  leaving: null,
  intro: 'pending',

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
    const { isTransitioning } = get()
    if (isTransitioning) return
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

  beginIntro: () => {
    if (get().intro !== 'pending') return
    if (prefersReducedMotion()) {
      set({ intro: 'done', scene: 'cockpit', from: null, isTransitioning: false })
      return
    }
    set({ intro: 'holding' })
  },

  beginFlight: () => {
    if (get().intro !== 'holding') return
    set({ intro: 'playing' })
  },

  endIntro: () => {
    if (get().intro !== 'playing') return
    set({
      intro: 'done',
      scene: 'cockpit',
      from: 'ocean',
      isTransitioning: false,
      focus: null,
      activeExhibitId: null,
    })
  },
}))

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
  activeExhibit: string | null

  /** Begin a move. No-ops if mid-flight or if the route doesn't allow it. */
  goTo: (next: SceneState) => void
  /** Called by CameraRig once the tween lands. */
  arrive: () => void
  openExhibit: (id: string) => void
  closeExhibit: () => void
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scene: 'ocean',
  from: null,
  isTransitioning: false,
  activeExhibit: null,

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
      activeExhibit: null,
    })
  },

  arrive: () => set({ from: null, isTransitioning: false }),

  openExhibit: (id) => {
    if (get().isTransitioning) return
    set({ activeExhibit: id })
  },

  closeExhibit: () => set({ activeExhibit: null }),
}))

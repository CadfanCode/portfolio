import { create } from 'zustand'

/** Where the camera currently lives in the world. */
export type SceneState = 'ocean' | 'cockpit' | 'cabin'

type SceneStore = {
  scene: SceneState
  /** Id of the exhibit currently opened, or null when none is. */
  activeExhibit: string | null
  goTo: (scene: SceneState) => void
  openExhibit: (id: string) => void
  closeExhibit: () => void
}

export const useSceneStore = create<SceneStore>((set) => ({
  scene: 'ocean',
  activeExhibit: null,
  goTo: (scene) => set({ scene, activeExhibit: null }),
  openExhibit: (id) => set({ activeExhibit: id }),
  closeExhibit: () => set({ activeExhibit: null }),
}))

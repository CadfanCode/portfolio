import type { ComponentType } from 'react'
import type { Vector3Tuple } from 'three'
import type { SceneState } from '../../state/useSceneStore'

export type ExhibitHotspotProps = {
  /** True while the pointer is over the hotspot, for highlight styling. */
  hovered: boolean
}

export type ExhibitSceneProps = {
  /**
   * False once the exhibit has been closed but is still playing its exit.
   * <Exhibits /> keeps the component mounted until `onExited` fires, so an
   * exhibit can animate itself away instead of vanishing.
   */
  active: boolean
  /** Call when the exit animation has finished and it is safe to unmount. */
  onExited: () => void
}

/**
 * A self-contained project demo presented as an object in the boat.
 *
 * Everything an exhibit needs lives in its own module: the registry only lists
 * it. Nothing here reaches into the camera rig or the scene state machine.
 *
 * Two shapes are supported. A *panel* exhibit supplies `Content` and is shown
 * in the standard overlay. A *staged* exhibit supplies `Scene` and builds its
 * own object in 3D; its `Content`, if any, is rendered bare over the canvas so
 * it can add chrome (arrows, captions) without covering the stage.
 */
export type Exhibit = {
  id: string
  /** Accessible name — used for the panel heading and the hotspot's object name. */
  label: string
  /** The stop this exhibit lives at. Hotspots only render at their own stop. */
  scene: SceneState
  /**
   * The close-up this exhibit lives inside, as a `CAMERA_FOCUS` id. Omit for an
   * exhibit reached from the stop itself; a focus id means the hotspot is only
   * live once the camera has moved in on that object.
   */
  focus?: string
  /** Where the hotspot sits in world space. Omit when another component triggers it. */
  position?: Vector3Tuple
  /**
   * The clickable 3D object. Selection is wired up by <Exhibits />. Omit when
   * the trigger is an object that already exists in the scene — a book on the
   * shelf calls `openExhibit` itself rather than growing a second hit target.
   */
  HotspotMesh?: ComponentType<ExhibitHotspotProps>
  /** 3D content, mounted into the scene while the exhibit is open. */
  Scene?: ComponentType<ExhibitSceneProps>
  /** The panel body, rendered as DOM outside the Canvas. */
  Content?: ComponentType
}

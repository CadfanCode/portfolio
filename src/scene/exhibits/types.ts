import type { ComponentType } from 'react'
import type { Vector3Tuple } from 'three'
import type { SceneState } from '../../state/useSceneStore'

export type ExhibitHotspotProps = {
  /** True while the pointer is over the hotspot, for highlight styling. */
  hovered: boolean
}

/**
 * A self-contained project demo presented as an object in the boat.
 *
 * Everything an exhibit needs lives in its own module: the registry only lists
 * it. Nothing here reaches into the camera rig or the scene state machine.
 */
export type Exhibit = {
  id: string
  /** Accessible name — used for the panel heading and the hotspot's object name. */
  label: string
  /** The stop this exhibit lives at. Hotspots only render at their own stop. */
  scene: SceneState
  /** Where the hotspot sits in world space. */
  position: Vector3Tuple
  /** The clickable 3D object. Selection is wired up by <Exhibits />. */
  HotspotMesh: ComponentType<ExhibitHotspotProps>
  /** The panel body, rendered as DOM outside the Canvas. */
  Content: ComponentType
}

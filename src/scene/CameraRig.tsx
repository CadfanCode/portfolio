import { useSceneStore } from '../state/useSceneStore'

/**
 * Drives the camera between scene states.
 * TODO: interpolate position/target on state change, then hand control to
 * drei's CameraControls with pan/dolly disabled and rotation limits set.
 */
export function CameraRig() {
  const scene = useSceneStore((s) => s.scene)
  void scene

  return null
}

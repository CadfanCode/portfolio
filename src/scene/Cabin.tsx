import { useSceneStore } from '../state/useSceneStore'

/** Below-deck interior. Lazy-loaded GLB later; empty group for now. */
export function Cabin() {
  const scene = useSceneStore((s) => s.scene)

  if (scene !== 'cabin') return null

  return <group position={[0, -1, 0]} />
}

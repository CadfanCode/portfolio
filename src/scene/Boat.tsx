import { useSceneStore } from '../state/useSceneStore'
import { usePointerSelect } from './usePointerSelect'

/** Placeholder hull — a box standing in for the GLB model. */
export function Boat() {
  const scene = useSceneStore((s) => s.scene)
  const goTo = useSceneStore((s) => s.goTo)

  const { bind } = usePointerSelect({
    enabled: scene === 'ocean',
    onSelect: () => goTo('cockpit'),
  })

  return (
    <mesh position={[0, 0.5, 0]} {...bind}>
      <boxGeometry args={[3, 1, 8]} />
      <meshStandardMaterial color="#e8e4dc" />
    </mesh>
  )
}

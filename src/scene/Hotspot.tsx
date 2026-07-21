import type { Vector3Tuple } from 'three'
import { usePointerSelect } from './usePointerSelect'

type HotspotProps = {
  position: Vector3Tuple
  /** Accessible name, also set as the object's name for debugging. */
  label: string
  enabled?: boolean
  onSelect: () => void
}

/**
 * Clickable navigation marker. Distinct from an exhibit: this moves the camera
 * rather than opening content.
 */
export function Hotspot({
  position,
  label,
  enabled = true,
  onSelect,
}: HotspotProps) {
  const { hovered, bind } = usePointerSelect({ enabled, onSelect })

  return (
    <mesh position={position} name={label} {...bind}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshBasicMaterial color={hovered ? '#ffffff' : '#ffcc33'} />
    </mesh>
  )
}

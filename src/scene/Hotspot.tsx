import type { Vector3Tuple } from 'three'

type HotspotProps = {
  position: Vector3Tuple
  onSelect: () => void
}

/** Clickable marker that opens an exhibit. Invisible mesh + affordance later. */
export function Hotspot({ position, onSelect }: HotspotProps) {
  return (
    <mesh position={position} onClick={onSelect}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshBasicMaterial color="#ffcc33" />
    </mesh>
  )
}

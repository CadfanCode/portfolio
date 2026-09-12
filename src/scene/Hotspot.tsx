import { useRef } from 'react'
import type { Mesh, Vector3Tuple } from 'three'
import { useFrame } from '@react-three/fiber'
import { usePointerSelect, IS_COARSE_POINTER } from './usePointerSelect'

type HotspotProps = {
  position: Vector3Tuple
  /** Accessible name, also set as the object's name for debugging. */
  label: string
  enabled?: boolean
  onSelect: () => void
}

/** Cycle length of the touch resting pulse, in seconds. Slow enough to read as
 *  an idle breathing motion rather than a blink demanding attention. */
const PULSE_PERIOD_S = 2.4

/** How far the pulse scales the marker up from its base size. */
const PULSE_AMPLITUDE = 0.12

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
  const mesh = useRef<Mesh>(null)

  // On a mouse, `hovered` flips white only on actual hover, so the resting
  // yellow reads as "marker" and the flip reads as "clickable". On a coarse
  // pointer `hovered` from the hook is pinned true at rest (see
  // `usePointerSelect`), so painting it white here all the time would just
  // turn every hotspot flat white and erase the marker colour. Keep the
  // yellow on touch and use a gentle scale pulse as the always-on cue instead.
  useFrame(({ clock }) => {
    if (!IS_COARSE_POINTER || !mesh.current) return
    const t = clock.getElapsedTime()
    const pulse = enabled
      ? 1 + PULSE_AMPLITUDE * (0.5 + 0.5 * Math.sin((t / PULSE_PERIOD_S) * Math.PI * 2))
      : 1
    mesh.current.scale.setScalar(pulse)
  })

  const showHoverColor = hovered && !IS_COARSE_POINTER

  // 70 mm across, not the 150 it began at. That was sized against the
  // placeholder box, when the nearest stop was metres off; the authored stops
  // put the viewer about 1.5 m from the companionway marker, where a 300 mm ball
  // is a beachball hanging in the hatch. This reads as a marker at that range
  // and still catches the eye.
  return (
    <mesh ref={mesh} position={position} name={label} {...bind}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshBasicMaterial
        color={showHoverColor ? '#ffffff' : '#ffcc33'}
        transparent
        opacity={0.85}
      />
    </mesh>
  )
}

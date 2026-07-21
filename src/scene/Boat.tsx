import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import { useSceneStore } from '../state/useSceneStore'

/** Placeholder hull — a box standing in for the GLB model. */
export function Boat() {
  const goTo = useSceneStore((s) => s.goTo)
  const ref = useRef<Mesh>(null)

  // Temporary: spinning proves the render loop is live. Drop this once the
  // real hull and CameraRig land.
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.4
  })

  return (
    <mesh ref={ref} position={[0, 0.5, 0]} onClick={() => goTo('cockpit')}>
      <boxGeometry args={[3, 1, 8]} />
      <meshStandardMaterial color="#e8e4dc" />
    </mesh>
  )
}

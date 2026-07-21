import { useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useSceneStore } from '../state/useSceneStore'

/** Pointer travel, in px, past which a press counts as a drag and not a click. */
const DRAG_SLOP = 5

/** Placeholder hull — a box standing in for the GLB model. */
export function Boat() {
  const scene = useSceneStore((s) => s.scene)
  const goTo = useSceneStore((s) => s.goTo)

  const pressedAt = useRef<{ x: number; y: number } | null>(null)
  const boardable = scene === 'ocean'

  // Deliberately no stopPropagation: a drag starting on the hull should still
  // rotate the camera, it just must not also count as a click.
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pressedAt.current = { x: e.clientX, y: e.clientY }
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const start = pressedAt.current
    pressedAt.current = null

    if (!boardable || !start) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP) return

    goTo('cockpit')
  }

  // Release the cursor when the hull stops being boardable, and on unmount —
  // otherwise it stays a pointer after you board, with nothing to hover off of.
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [boardable])

  return (
    <mesh
      position={[0, 0.5, 0]}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onPointerOver={() => {
        if (boardable) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
    >
      <boxGeometry args={[3, 1, 8]} />
      <meshStandardMaterial color="#e8e4dc" />
    </mesh>
  )
}

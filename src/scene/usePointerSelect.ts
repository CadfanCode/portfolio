import { useEffect, useRef, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'

/** Pointer travel, in px, past which a press counts as a drag and not a click. */
const DRAG_SLOP = 5

type PointerSelectOptions = {
  /** When false, the object neither highlights nor responds to clicks. */
  enabled?: boolean
  onSelect: () => void
}

/**
 * Drag-aware selection for a 3D object, plus the hover affordance.
 *
 * R3F maps onClick to the DOM click event, which browsers fire after any
 * mousedown/mouseup pair on the canvas — including a drag. Without the slop
 * check, looking around and releasing over an object would select it.
 *
 * Spread `bind` onto a mesh or a group; R3F events bubble up the object graph,
 * so binding a group covers everything drawn inside it.
 */
export function usePointerSelect({
  enabled = true,
  onSelect,
}: PointerSelectOptions) {
  const pressedAt = useRef<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)

  // Drop the hover state and release the cursor when the object stops being
  // selectable, and on unmount — otherwise the pointer sticks with nothing left
  // to hover off of.
  useEffect(() => {
    if (!enabled) setHovered(false)

    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [enabled])

  const bind = {
    // Deliberately no stopPropagation: a drag starting on the object should
    // still rotate the camera, it just must not also count as a click.
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      pressedAt.current = { x: e.clientX, y: e.clientY }
    },

    onClick: (e: ThreeEvent<MouseEvent>) => {
      const start = pressedAt.current
      pressedAt.current = null

      if (!enabled || !start) return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP) return

      onSelect()
    },

    onPointerOver: () => {
      if (!enabled) return
      setHovered(true)
      document.body.style.cursor = 'pointer'
    },

    onPointerOut: () => {
      setHovered(false)
      document.body.style.cursor = 'auto'
    },
  }

  return { hovered, bind }
}

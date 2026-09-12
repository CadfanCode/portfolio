import { useEffect, useRef, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'

/** Pointer travel, in px, past which a press counts as a drag and not a click. */
const DRAG_SLOP = 5

/**
 * Whether the primary pointer is touch-like rather than a mouse. Read once at
 * module load, the same test `quality.ts` uses for its own coarse-pointer
 * check — a session does not switch input class mid-visit, so there is no
 * need for a listener, and importing `quality.ts` here would pull the whole
 * quality-detection module into every clickable object for one boolean.
 */
export const IS_COARSE_POINTER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches

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
  // to hover off of. The cursor itself is a mouse-only affordance: writing to
  // it on a coarse pointer does nothing useful and, on a hybrid device that
  // reports coarse as its primary pointer but still has a mouse attached,
  // risks leaving a stale value nothing then clears.
  useEffect(() => {
    if (!enabled) setHovered(false)

    return () => {
      if (!IS_COARSE_POINTER) document.body.style.cursor = 'auto'
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

      // Claim the click so nothing behind this object also selects. R3F walks
      // every object the ray hits, near-to-far, and only stops at a handler
      // that says so — so without this, a click clipping two neighbouring hit
      // boxes runs both `onSelect`s and the *farther* object, going last,
      // wins. That is what made the book spines open each other's exhibit:
      // barely 4 mm of air sits between two spines, and each one's hit box is
      // deliberately pushed 25 mm out into the cabin to be clickable at all,
      // so an off-square ray goes through both.
      //
      // Stopped here rather than at the top of the handler on purpose. A drag
      // release and a disabled object have both already returned above, so
      // neither swallows a click meant for something behind it — only an
      // object that is actually about to select does. This flags R3F's own
      // traversal and leaves the DOM event alone, so `FocusExit` and the rest
      // of the overlay chrome still see it.
      e.stopPropagation()
      onSelect()
    },

    onPointerOver: () => {
      if (!enabled) return
      setHovered(true)
      if (!IS_COARSE_POINTER) document.body.style.cursor = 'pointer'
    },

    onPointerOut: () => {
      setHovered(false)
      if (!IS_COARSE_POINTER) document.body.style.cursor = 'auto'
    },
  }

  // On a coarse pointer there is no hover to discover, so the interactive
  // look has to be on at rest rather than waiting for an event that may never
  // fire consistently — a tap can land and release without ever registering
  // pointerover. `enabled` still gates it: a disabled target must stay inert
  // on touch exactly as it does under a mouse.
  return { hovered: IS_COARSE_POINTER ? enabled : hovered, bind }
}

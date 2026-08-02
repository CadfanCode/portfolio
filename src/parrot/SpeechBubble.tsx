import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, MathUtils, SRGBColorSpace, Vector3 } from 'three'
import type { Mesh, MeshBasicMaterial } from 'three'
import { useQualityStore } from '../state/useQualityStore'
import { PARROT_POSITION } from './geometry'

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 360

/** World size of the plane the canvas is stretched over. */
const BUBBLE_WIDTH = 0.42
const BUBBLE_HEIGHT = 0.2364 // BUBBLE_WIDTH at the canvas's own 16:9 aspect.

/** Just inboard of and above the perch (see `PARROT_POSITION`) — inboard is
 *  still +x, toward the centreline, though the perch itself has moved to
 *  the coachroof crown above the companionway rather than a side deck.
 *  Verified clear of all boat geometry: the mast is at z -0.407..-0.111,
 *  the boom and mainsail are to starboard at x 0.444+. */
const BUBBLE_POSITION = new Vector3(
  PARROT_POSITION[0] + 0.22,
  PARROT_POSITION[1] + 0.22,
  PARROT_POSITION[2] + 0.24,
)

/** Anchor for the chat balloon (`ParrotChat.tsx`, mounted via `<Html>` from
 *  `ParrotAssistant.tsx`), defined next to `BUBBLE_POSITION` so the two
 *  in-world anchors on the bird don't drift apart. Its own, smaller offset
 *  rather than reusing `BUBBLE_POSITION`: the balloon is a DOM panel, not a
 *  billboard plane, and the CSS itself pushes it further up-and-right of
 *  this point so its tail lands on the bird (see `ParrotChat.css`). */
export const CHAT_ANCHOR: readonly [number, number, number] = [
  PARROT_POSITION[0] + 0.1,
  PARROT_POSITION[1] + 0.2,
  PARROT_POSITION[2] + 0.06,
]

/**
 * Scratch for the billboard, allocated once so `useFrame` never does.
 *
 * The bubble tracks the live camera rather than taking `IntroTitle.tsx`'s fixed
 * quaternion. That card can be authored to face one spot because the intro is a
 * scripted camera path with a known viewing position; this box is not. Both
 * exterior stops are free-look — the cockpit's `azimuthRange` is `Infinity` and
 * the ocean stop orbits the hull outright — so a fixed facing would turn edge-on
 * and disappear over most of the arc a visitor can actually look from.
 */
const billboardTarget = new Vector3()

const FONT_STACK = "system-ui, 'Segoe UI', Roboto, sans-serif"
const FILL_TOP = '#ffd76a'
const FILL_BOTTOM = '#f4a63a'
const BORDER_COLOUR = '#b5691a'
const TEXT_COLOUR = '#3a2308'

const DAMP_LAMBDA = 6

/** Draws a rounded speech-box with a small tail pointing down-left, toward
 *  the bird, and the line wrapped to fit inside it. Text is shrunk in a few
 *  steps rather than laid out with a real text-flow engine — the same
 *  shrink-to-fit idiom `BookSpines.tsx`'s `drawSpineCanvas` uses, because
 *  the copy here is short enough that "try a size, measure, back off" is
 *  simpler than word-wrap metrics done properly. */
function drawBubble(text: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const pad = 28
  const tailSize = 30
  const boxLeft = pad
  const boxTop = pad
  const boxRight = CANVAS_WIDTH - pad
  const boxBottom = CANVAS_HEIGHT - pad - tailSize
  const radius = 22

  const roundedRect = () => {
    ctx.beginPath()
    ctx.moveTo(boxLeft + radius, boxTop)
    ctx.arcTo(boxRight, boxTop, boxRight, boxBottom, radius)
    ctx.arcTo(boxRight, boxBottom, boxLeft, boxBottom, radius)
    ctx.arcTo(boxLeft, boxBottom, boxLeft, boxTop, radius)
    ctx.arcTo(boxLeft, boxTop, boxRight, boxTop, radius)
    ctx.closePath()
  }

  const gradient = ctx.createLinearGradient(0, boxTop, 0, boxBottom)
  gradient.addColorStop(0, FILL_TOP)
  gradient.addColorStop(1, FILL_BOTTOM)

  roundedRect()
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = BORDER_COLOUR
  ctx.stroke()

  // The tail: a small triangle off the box's lower-left, pointing down at
  // the bird perched below and to port of the box.
  ctx.beginPath()
  ctx.moveTo(boxLeft + 46, boxBottom - 2)
  ctx.lineTo(boxLeft + 14, boxBottom + tailSize)
  ctx.lineTo(boxLeft + 78, boxBottom - 2)
  ctx.closePath()
  ctx.fillStyle = FILL_BOTTOM
  ctx.fill()
  ctx.stroke()

  // Word-wrap into the box, shrinking the font until every line fits both
  // the box's width and, stacked, its height.
  const maxWidth = boxRight - boxLeft - 56
  const maxHeight = boxBottom - boxTop - 40
  let fontSize = 46
  let lines: string[] = []
  let lineHeight = fontSize * 1.2

  for (; fontSize >= 22; fontSize -= 2) {
    ctx.font = `600 ${fontSize}px ${FONT_STACK}`
    lineHeight = fontSize * 1.25
    const words = text.split(' ')
    lines = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    if (lines.length * lineHeight <= maxHeight) break
  }

  ctx.fillStyle = TEXT_COLOUR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const startY = (boxTop + boxBottom) / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_WIDTH / 2, startY + i * lineHeight)
  })

  return canvas
}

type SpeechBubbleProps = {
  /** The line to show, or `null` to fade out. `null` keeps the last drawn
   *  texture on screen while the opacity damps to zero, rather than
   *  clearing the canvas — there's nothing to read once it's invisible. */
  line: string | null
}

/**
 * The in-world speech box, floating just inboard of and above Skipper's
 * perch. Follows `IntroTitle.tsx`'s technique exactly: a 2D canvas wrapped
 * in a `CanvasTexture`, oriented with a quaternion from a scratch
 * `Object3D().lookAt()` (which aims local +Z — the face a `planeGeometry` is
 * printed on — so the result is used as-is, not "corrected"), and drawn with
 * `depthTest={false}` over everything else.
 */
export function SpeechBubble({ line }: SpeechBubbleProps) {
  const gl = useThree((s) => s.gl)
  const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)

  const material = useRef<MeshBasicMaterial>(null)
  const mesh = useRef<Mesh>(null)
  const opacity = useRef(0)

  const lastLine = useRef('')
  if (line) lastLine.current = line
  const displayLine = lastLine.current

  const texture = useMemo(() => {
    if (!displayLine) return null
    const canvas = drawBubble(displayLine)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    return tex
  }, [displayLine, anisotropy, gl])

  useEffect(() => {
    return () => texture?.dispose()
  }, [texture])

  useFrame((state, delta) => {
    opacity.current = MathUtils.damp(opacity.current, line ? 1 : 0, DAMP_LAMBDA, delta)
    if (material.current) material.current.opacity = opacity.current
    if (mesh.current) {
      mesh.current.visible = opacity.current > 0.01
      // Billboard. The bird rides `boatFrame`, so the box heels and pitches with
      // the hull while its *facing* stays square to the lens — the paper leans
      // with the boat, the print stays readable. `lookAt` aims local +Z, which is
      // the face a `planeGeometry` is printed on, so this is used as-is and must
      // not be "corrected" (the same note applies in `IntroTitle.tsx:161-165`).
      // The camera's world position has to be brought into the parent's frame
      // first, since this mesh is several rotated groups deep.
      if (mesh.current.visible && mesh.current.parent) {
        billboardTarget.copy(state.camera.position)
        mesh.current.parent.worldToLocal(billboardTarget)
        mesh.current.lookAt(billboardTarget)
      }
    }
  })

  if (!texture) return null

  return (
    <mesh ref={mesh} position={BUBBLE_POSITION} renderOrder={900} frustumCulled={false}>
      <planeGeometry args={[BUBBLE_WIDTH, BUBBLE_HEIGHT]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}

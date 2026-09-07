import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { useQualityStore } from '../../state/useQualityStore'
import { makeRng } from './noise'

/** Texture pixels per side. Repeated 8x8 across an island, so this only ever
 *  needs to read convincingly close up on the near skerry — see the plan's
 *  note that it swings right past the ocean camera. */
const SIZE = 1024
/** Fixed seed for the blotch and speckle passes: the rock must look the same
 *  on every load, the same way the island shapes themselves do. */
const SEED = 4001

/** Warm pink-grey blotch colours, layered over the base tone. Baltic granite
 *  reads as pink-grey and mottled, never as a flat grey — a single colour
 *  here would look like a slab of concrete rather than rock. */
const BLOTCH_COLORS = ['#a4938c', '#7a7570', '#b3a49b']

/** Draw the granite albedo: a base fill, many soft overlapping blotches, then
 *  a fine speckle pass — the same procedural-texture idiom as
 *  `CabinPictures.tsx`'s plaques, just with paint instead of engraving. */
function drawGraniteCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = '#8d8781'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const rng = makeRng(SEED)

  // Soft overlapping ellipses. Low opacity plus a blurred edge (radial
  // gradient rather than a hard fill) is what keeps these reading as mineral
  // blotches rather than as painted spots.
  const blotchCount = 140
  for (let i = 0; i < blotchCount; i++) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const rx = 20 + rng() * 90
    const ry = rx * (0.5 + rng() * 0.7)
    const angle = rng() * Math.PI
    const color = BLOTCH_COLORS[Math.floor(rng() * BLOTCH_COLORS.length)]

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry))
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.globalAlpha = 0.18 + rng() * 0.22
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Fine speckle pass on top — the mica glints that keep granite from
  // reading smooth even where the blotches leave it bare.
  ctx.globalAlpha = 1
  const speckleCount = 6000
  for (let i = 0; i < speckleCount; i++) {
    const x = rng() * SIZE
    const y = rng() * SIZE
    const dark = rng() < 0.5
    ctx.fillStyle = dark ? 'rgba(50, 46, 42, 0.35)' : 'rgba(230, 222, 210, 0.35)'
    ctx.fillRect(x, y, 1, 1)
  }

  return canvas
}

/**
 * The shared granite material for every island mesh: one `CanvasTexture`
 * memoised for the life of the session, `vertexColors` on so the wet-rock and
 * lichen bands `island.ts` bakes per vertex actually show through the base
 * texture.
 */
export function useGraniteMaterial(): MeshStandardMaterial {
  const gl = useThree((s) => s.gl)
  const anisotropy = useQualityStore((s) => s.settings.textures.anisotropy)

  const texture = useMemo(() => {
    const canvas = drawGraniteCanvas()
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.repeat.set(8, 8)
    tex.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    return tex
  }, [anisotropy, gl])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0,
        vertexColors: true,
      }),
    [texture],
  )

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  return material
}

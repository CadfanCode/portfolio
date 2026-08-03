import { CanvasTexture } from 'three'
import type { MeshStandardMaterial } from 'three'

/**
 * Recolours the parrot's palette-atlas texture from red to green, in place
 * on a canvas copy of the source image. The atlas is a 64x64, 9-colour flat
 * palette (verified by counting distinct texels): two reds for the body and
 * head plumage, and the rest — yellow wing patch, navy wing/tail, grey beak,
 * white face, black feet — left alone.
 *
 * Selects by hue band rather than matching the literal red RGB values, so
 * this keeps working if the source asset is ever swapped for one with
 * slightly different reds; the band (saturated, near 0/360 deg) is wide
 * enough to catch both plumage reds and nothing else in this palette.
 */
const RED_HUE_MAX_DEG = 20
const RED_HUE_MIN_DEG = 330
const RED_SAT_THRESHOLD = 0.5

/** Target hue for the recoloured plumage: a deep leaf green, not neon. */
const GREEN_HUE = 110 / 360
/** These multipliers, not a plain hue swap, are what keeps the result a
 *  believable green rather than a neon one — chosen by rendering five
 *  candidate greens on the posed mesh and comparing. Do not adjust. */
const GREEN_SAT_MULTIPLIER = 0.78
const GREEN_LUM_MULTIPLIER = 0.82

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0)
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
  }
  return [h / 6, s, l]
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
}

/**
 * Builds a recoloured `CanvasTexture` from `material.map` and swaps it in,
 * mutating the material (already a clone — see `parrotRig.ts` — so the
 * `useGLTF` cache is never touched). Returns the new texture so the caller
 * can dispose it on unmount; the source texture is left alone, since it
 * belongs to the cache and other things may hold it.
 */
export function recolorPlumageGreen(material: MeshStandardMaterial): CanvasTexture | null {
  const source = material.map
  const image = source?.image as HTMLImageElement | ImageBitmap | undefined
  if (!source || !image) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    const hueDeg = h * 360
    if (s > RED_SAT_THRESHOLD && (hueDeg > RED_HUE_MIN_DEG || hueDeg < RED_HUE_MAX_DEG)) {
      const [r, g, b] = hslToRgb(
        GREEN_HUE,
        Math.min(1, s * GREEN_SAT_MULTIPLIER),
        Math.min(1, l * GREEN_LUM_MULTIPLIER),
      )
      data[i] = Math.round(r * 255)
      data[i + 1] = Math.round(g * 255)
      data[i + 2] = Math.round(b * 255)
    }
  }
  ctx.putImageData(imageData, 0, 0)

  const texture = new CanvasTexture(canvas)
  // `CanvasTexture` defaults to `flipY = true`; glTF textures ship with
  // `flipY = false`. Left uncopied, the UVs come out vertically mirrored,
  // which on a palette atlas reads as wrong colours in the wrong places
  // rather than an obviously flipped image.
  texture.flipY = source.flipY
  texture.colorSpace = source.colorSpace
  texture.wrapS = source.wrapS
  texture.wrapT = source.wrapT
  texture.magFilter = source.magFilter
  texture.minFilter = source.minFilter
  texture.anisotropy = source.anisotropy
  texture.needsUpdate = true

  material.map = texture
  return texture
}

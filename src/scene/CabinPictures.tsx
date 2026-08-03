import { useTexture } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import maxi77Url from '../assets/textures/maxi77.jpg?url'
import alysTeddyUrl from '../assets/textures/alys-teddy.jpg?url'
import { useQualityStore } from '../state/useQualityStore'

/**
 * Two framed photographs on the main bulkhead — the boat to port, the owner's
 * dogs to starboard — hung outboard of the brass, on the same panels as the
 * clock, barometer and tell-tale.
 *
 * This is the wall the cabin stop looks straight down the saloon at, and the
 * one spot below deck that is neither structure nor stowage (see
 * `fitout._build_instruments`). The doorway to the forepeak splits it into a
 * port panel and a starboard one, and the brass sits just off each doorway
 * edge, so the free wall on each panel is the strip *outboard* of it: roughly
 * x 0.42…1.00 to port and 0.60…1.00 to starboard, between the shelf below and
 * the deckhead's camber above.
 *
 * Deliberately not a matched pair — different centres, heights, sizes and a
 * hair of opposite roll — because two identical frames symmetric about the
 * doorway would read as furniture rather than as two photographs someone
 * chose and hung.
 *
 * Each frame carries a small engraved brass plaque on its bottom rail, which
 * is why that rail is deeper than the other three sides — a weighted-bottom
 * moulding, the classic way to give a picture somewhere to hang a plate
 * without the plate reading as bolted on top of the wood. And each frame is
 * now a click-to-focus target: `photo-boat` and `photo-dogs` in
 * `cameraFocus.ts` fly the camera in close enough to read the plaques. The
 * pictures themselves stay non-interactive here, exactly as the desk and the
 * VHF are — `FocusTargets` owns hit-testing through its own proxy boxes, and
 * this component only ever draws what the frame looks like.
 */

type PictureDef = {
  url: string
  /** Picture-plane size, in metres. */
  width: number
  height: number
  /** Half the moulding's excess over the picture on each edge, other than
   *  the bottom rail (see `borderBottom`). */
  border: number
  /** The bottom rail's own depth, deeper than `border` so it can carry the
   *  plaque — the frame's classic "weighted bottom" mount. */
  borderBottom: number
  x: number
  y: number
  /** Small roll, in radians, so the two frames don't look machine-placed. */
  roll: number
  label: string
  /** The engraved plate on the bottom rail: the lines to cut, and the
   *  plate's own size in metres. */
  plaque: { lines: readonly string[]; width: number; height: number }
}

/** The saloon-facing face of the main bulkhead, in boat-frame metres — see
 *  `PortfolioWorld.tsx`'s `boatFrame`, which both pictures ride inside. The
 *  panel is solid from the doorway edge (|x| 0.230) out to the topsides, and
 *  the instruments stand proud of this same plane. */
const WALL_Z = -0.689
/** Moulding depth. The cabin camera sits aft at z = 1.05 and looks forward, so
 *  the frames grow toward +z, out of the wall and toward the lens. */
const MOULDING_DEPTH = 0.018
/** How proud of the moulding's front face the picture plane sits — just enough
 *  to keep the two surfaces from z-fighting, far too little to read as the
 *  photo floating off the frame. */
const PICTURE_PROUD = 0.0008
/** Plaque body depth, screwed to the face of the bottom rail. */
const PLAQUE_THICKNESS = 0.002
/** How proud of the plaque body the engraved face sits — same z-fighting
 *  guard as `PICTURE_PROUD`, and it keeps the plate's own edges reading as
 *  plain brass rather than smeared texture. */
const PLAQUE_PROUD = 0.0003

/*
 * Measured clearances, from the bulkhead's own triangles rather than its
 * bounding box (the panel's top edge follows the deck camber, so a box says
 * nothing useful):
 *
 *   port frame   x -0.858…-0.602, y 0.635…0.963   (moulding, incl. plaque rail)
 *     tell-tale ends at x -0.396 ......... 206 mm inboard
 *     panel edge at that height -1.016 ... 158 mm outboard
 *     shelf top 0.616 (only outboard of |x| 0.870, so not under this
 *       frame at all) ................... 19 mm below
 *   stbd frame   x  0.653… 0.908, y 0.633… 0.941
 *     barometer ends at x 0.571 .......... 82 mm inboard
 *     panel edge at that height 1.044 .... 136 mm outboard
 *     shelf top 0.616 (the outboard 38 mm of this frame does overhang
 *       the shelf's inboard edge) ....... 17 mm below
 *
 * Both tops stay under y 0.99, which is where the starboard panel starts
 * losing width to the camber.
 */
const PICTURES: readonly PictureDef[] = [
  {
    url: maxi77Url,
    width: 0.22,
    height: 0.28,
    border: 0.018,
    borderBottom: 0.03,
    x: -0.73,
    y: 0.805,
    roll: 0.01,
    label: 'picture_maxi77',
    plaque: {
      lines: ['A smooth sea never made a skilled sailor'],
      width: 0.152,
      height: 0.018,
    },
  },
  {
    url: alysTeddyUrl,
    width: 0.223,
    height: 0.26,
    border: 0.016,
    borderBottom: 0.032,
    x: 0.78,
    y: 0.795,
    roll: -0.014,
    label: 'picture_alys_teddy',
    plaque: {
      lines: ['The ton-up terrors.', 'No half biscuits'],
      // Narrower than the port plate, and not for variety's sake: two short
      // lines on a 120 mm plate leave a third of it bare either side. At
      // 92 mm the setting fills about 70% of its column, which is what the
      // one-line plate opposite does at 152 mm.
      width: 0.092,
      height: 0.021,
    },
  },
]

// Warmed the moment the module loads, same as the GLB itself — the cabin's
// pictures suspend on first paint (see the render-unconditionally note
// below), so their textures should already be in flight by then.
useTexture.preload(maxi77Url)
useTexture.preload(alysTeddyUrl)

/**
 * Photographs are sRGB and `useTexture` does not say so on our behalf, which
 * left unset renders them washed out and slightly wrong in hue.
 *
 * Done through `useTexture`'s own `onLoad` rather than an effect of ours, and
 * that is a correctness point rather than a tidiness one: drei uploads the
 * texture to the GPU inside a `useEffect`, and an effect we declare after it
 * would therefore run *after* the upload. `onLoad` fires from a
 * `useLayoutEffect`, ahead of both the upload and the first draw, so the
 * colour space is already right the first time the material compiles — no
 * `needsUpdate` recompile needed.
 *
 * No longer module-level: the anisotropy ceiling comes from the quality tier,
 * which is only reachable inside the component, so this is built with
 * `useCallback` and kept referentially stable across re-renders instead —
 * `gl` and the tier's `anisotropy` are both fixed for the life of the session,
 * so in practice this identity never changes either.
 */
function useApplySRGB() {
  const gl = useThree((s) => s.gl)
  const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)
  return useCallback(
    (texture: Texture) => {
      texture.colorSpace = SRGBColorSpace
      // Matching `BookSpines`' spine lettering: these hang almost flat to the
      // camera but the cabin is dim enough that the cheap win is worth
      // taking. The GPU's own maximum still wins where it is lower than the
      // tier's ceiling.
      texture.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    },
    [gl, anisotropy],
  )
}

/**
 * Renders an engraved brass plaque: a gradient field, a stroked inset border,
 * a screw head near each end, and the lines cut between them — lit lower lip
 * plus dark true stroke, the same double-pass idiom a real engraving's angled
 * cut gives under a single light. Sibling in spirit to `BookSpines`'
 * `drawSpineCanvas`: fixed resolution, plain Canvas 2D, fit-by-shrinking.
 */
function drawPlaqueCanvas(lines: readonly string[], aspect: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const width = 2048
  const height = Math.max(16, Math.round(2048 / aspect))
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // 1. Brass field.
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, '#d9b96a')
  gradient.addColorStop(1, '#a8873c')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // 2. Engraved border line, inset from the plate's own edges.
  const inset = height * 0.07
  ctx.strokeStyle = '#6b5220'
  ctx.lineWidth = height * 0.015
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2)

  // 3. A screw head near each end, its own reserved inset keeping the text
  // column clear of it.
  const screwRadius = height * 0.18
  const screwInset = screwRadius * 2.2
  const screwY = height / 2
  const screwXs = [screwInset, width - screwInset]
  for (const screwX of screwXs) {
    ctx.fillStyle = '#7a5f28'
    ctx.beginPath()
    ctx.arc(screwX, screwY, screwRadius, 0, Math.PI * 2)
    ctx.fill()
    // The catch of light on the upper-left of the head.
    ctx.strokeStyle = '#e2c67e'
    ctx.lineWidth = screwRadius * 0.22
    ctx.beginPath()
    ctx.arc(screwX, screwY, screwRadius * 0.55, Math.PI * 1.05, Math.PI * 1.55)
    ctx.stroke()
  }

  // 4. The lines, centred in the column between the two screws.
  const columnLeft = screwInset + screwRadius * 1.4
  const columnRight = width - screwInset - screwRadius * 1.4
  const columnCentre = (columnLeft + columnRight) / 2
  const columnWidth = columnRight - columnLeft

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Fit by measuring once and scaling, rather than `drawSpineCanvas`' shrink
  // loop, because these plates need to be able to grow as well: a spine's
  // title always overruns its column and only ever wants shrinking, whereas
  // 'No half biscuits' across 92 mm of brass would otherwise be set at the
  // size a forty-character line needs and swim in bare metal. Whichever of
  // the two constraints binds first wins, which is how an engraver sets it —
  // a one-line plate ends up limited by its width, a two-line plate by its
  // height.
  const rowHeight = height / (lines.length + 1)
  const reference = 100
  ctx.font = `600 ${reference}px Georgia, "Times New Roman", serif`
  const referenceWidth = Math.max(...lines.map((line) => ctx.measureText(line).width))
  const byWidth = (reference * columnWidth * 0.9) / referenceWidth
  const size = Math.max(8, Math.round(Math.min(rowHeight * 0.75, byWidth)))
  ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`

  // 5. The engraved cut: the lit lower lip first, the dark true line on top.
  lines.forEach((line, i) => {
    const y = rowHeight * (i + 1)
    ctx.fillStyle = '#e8cd8b'
    ctx.fillText(line, columnCentre + height * 0.015, y + height * 0.015)
    ctx.fillStyle = '#4a3a18'
    ctx.fillText(line, columnCentre, y)
  })

  return canvas
}

function Picture({
  url,
  width,
  height,
  border,
  borderBottom,
  x,
  y,
  roll,
  label,
  plaque,
}: PictureDef) {
  const gl = useThree((s) => s.gl)
  const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)
  const applySRGB = useApplySRGB()
  const texture = useTexture(url, applySRGB)
  const outerWidth = width + border * 2
  const outerHeight = height + border + borderBottom
  // The moulding box is no longer centred on the picture: the bottom rail's
  // extra depth hangs the whole box lower, while the group itself stays at
  // the picture's own centre.
  const frameOffsetY = (border - borderBottom) / 2
  const plaqueY = (-height / 2 + (frameOffsetY - outerHeight / 2)) / 2

  const plaqueAspect = plaque.width / plaque.height
  const plaqueTexture = useMemo(() => {
    const canvas = drawPlaqueCanvas(plaque.lines, plaqueAspect)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    return tex
  }, [plaque.lines, plaqueAspect, anisotropy, gl])

  useEffect(() => {
    return () => plaqueTexture.dispose()
  }, [plaqueTexture])

  return (
    // No Y-flip here, and that is the thing to get wrong: `planeGeometry`
    // faces +z by default, which is already the way this wall is seen — the
    // camera is aft of it at z = 1.05 looking forward. (The frames grew a
    // 180° turn while they were on the after bulkhead, where the wall is
    // *behind* the lens and every face pointed the wrong way.) Roll is
    // applied about z, which leaves the local z offsets below untouched.
    <group position={[x, y, WALL_Z]} rotation={[0, 0, roll]}>
      <mesh name={`${label}_frame`} position={[0, frameOffsetY, MOULDING_DEPTH / 2]}>
        <boxGeometry args={[outerWidth, outerHeight, MOULDING_DEPTH]} />
        <meshStandardMaterial color="#4a3323" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh name={label} position={[0, 0, MOULDING_DEPTH + PICTURE_PROUD]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.42}
          metalness={0}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={0.22}
        />
      </mesh>
      <mesh
        name={`${label}_plaque`}
        position={[0, plaqueY, MOULDING_DEPTH + PLAQUE_THICKNESS / 2]}
      >
        <boxGeometry args={[plaque.width, plaque.height, PLAQUE_THICKNESS]} />
        <meshStandardMaterial color="#b98f42" metalness={0.65} roughness={0.34} />
      </mesh>
      <mesh
        name={`${label}_plaque_face`}
        position={[0, plaqueY, MOULDING_DEPTH + PLAQUE_THICKNESS + PLAQUE_PROUD]}
      >
        <planeGeometry args={[plaque.width, plaque.height]} />
        <meshStandardMaterial
          map={plaqueTexture}
          color="#ffffff"
          metalness={0.55}
          roughness={0.3}
          emissiveMap={plaqueTexture}
          emissive="#ffffff"
          emissiveIntensity={0.15}
        />
      </mesh>
    </group>
  )
}

/**
 * The two framed photographs on the main bulkhead. Not gated on
 * `scene === 'cabin'`: `useTexture` suspends, and the whole world sits
 * behind one `<Suspense fallback={null}>` in `App.tsx`, so mounting this
 * only once the cabin is reached would blank the entire scene for a frame
 * as it suspends after first paint. Rendering unconditionally instead costs
 * nothing worth noticing — the hull hides the bulkhead from outside — and
 * keeps the suspense boundary doing its job at startup instead of mid-visit.
 */
export function CabinPictures() {
  return (
    <>
      {PICTURES.map((picture) => (
        <Picture key={picture.label} {...picture} />
      ))}
    </>
  )
}

import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { useSceneStore } from '../../../state/useSceneStore'
import { useQualityStore } from '../../../state/useQualityStore'
import { usePointerSelect } from '../../usePointerSelect'
import { renderWhiteboard } from './renderWhiteboard'
import { useBlogPosts } from './useBlogPosts'

/**
 * The cabin memo board: the latest posts from the owner's blog, scrawled in
 * marker on the starboard companionway face above the VHF. See the design
 * spec (`docs/superpowers/specs/2026-09-07-blog-whiteboard-design.md`) for
 * the placement reasoning and the four decisions this component encodes.
 *
 * Not registered as an `Exhibit`: it needs none of the three things the
 * registry exists to carry (a staged 3D scene, a DOM content panel, or its
 * own hotspot mesh, since `FocusTargets` already supplies the click-to-
 * approach box through a `CAMERA_FOCUS` entry). It is a wall object with a
 * link, the same shape `CabinPictures` and the GitHub book spine already
 * are, and neither of those is registered either.
 */

/** The companionway's own saloon-facing plane, at the board's centre height —
 *  see `cameraFocus.ts`'s measured numbers. That face is flat in x but leans
 *  away from the saloon as it rises (11.28° off vertical), so `COMPANIONWAY_Z`
 *  is the plane's z at `BOARD_Y` specifically, not a constant offset the way
 *  a vertical wall's would be. Starboard, not port: this is the face above
 *  the VHF, reached by turning round from the cabin stop (azimuth is
 *  unlimited there). */
const COMPANIONWAY_Z = 1.299
const BOARD_X = 0.762
const BOARD_Y = 0.8375
const BOARD_WIDTH = 0.36
const BOARD_HEIGHT = 0.27
const BORDER = 0.02
const MOULDING_DEPTH = 0.018
const PICTURE_PROUD = 0.0008

const BLOG_URL = 'https://cadfancode.wordpress.com/'

/** True once the Caveat webfont is confirmed ready — same idiom as
 *  `AboutBook.tsx`'s `useHandFontReady`, duplicated rather than imported
 *  because that hook is module-private there and this is a small, self-
 *  contained thing to own a second copy of. */
function useHandFontReady(): boolean {
  const [ready, setReady] = useState(() => document.fonts.check('700 32px "Caveat"'))
  useEffect(() => {
    if (ready) return
    let cancelled = false
    document.fonts.load('700 32px "Caveat"').then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])
  return ready
}

export function Whiteboard() {
  const gl = useThree((s) => s.gl)
  const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)
  const focus = useSceneStore((s) => s.focus)
  const posts = useBlogPosts()
  const fontReady = useHandFontReady()

  const texture = useMemo(() => {
    const canvas = renderWhiteboard(posts)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    return tex
    // `fontReady` is read only as a trigger: the first paint can land before
    // the Caveat webfont has loaded, and this forces exactly one redraw once
    // it has — same reasoning as `AboutBook.tsx`'s `usePageTextures`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, anisotropy, gl, fontReady])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  const { hovered, bind } = usePointerSelect({
    // Gated on the close-up rather than always live: from across the cabin
    // this is a wall the size of a dinner plate, and a stray click on it
    // must not fling a visitor to another tab. See the design spec's
    // "focus first, then the link" decision.
    enabled: focus === 'whiteboard',
    onSelect: () => window.open(BLOG_URL, '_blank', 'noopener,noreferrer'),
  })

  return (
    // Rotated 180° about Y rather than left unrotated the way `CabinPictures`'
    // frames are: those hang on the forward bulkhead, which the cabin camera
    // already faces at rest, so a plain `planeGeometry` (default normal +Z)
    // already points at the lens. This board is on the *aft* companionway
    // face, behind the camera at rest, so its normal needs turning round to
    // face back toward the saloon — hence the group rotation. A single
    // static 180° turn about the vertical axis swaps which world direction
    // is "screen right" for a viewer standing on the far side by exactly as
    // much as it swaps which local x maps to which world x, so the two
    // effects cancel and the canvas still reads left-to-right rather than
    // mirrored. (This is not the `ResumeBook.tsx` turned-page case: that
    // mirrors because a *second* rotation — the hinge — is layered on top of
    // the first one, and it is the pair that needs the compensating flip,
    // not a lone 180° turn like this one.) Local +z inside this group still
    // means "out of the wall, toward the lens", exactly as it does in
    // `CabinPictures`; the 180° turn is what makes that convention point the
    // right way here. The added X term (-11.28°, `atan(0.19945)`) tilts the
    // whole group to lie flat on the companionway's own sloped face rather
    // than standing vertical and burying its bottom edge in the wall.
    <group position={[BOARD_X, BOARD_Y, COMPANIONWAY_Z]} rotation={[-0.19685, Math.PI, 0]}>
      <mesh name="whiteboard_frame" position={[0, 0, MOULDING_DEPTH / 2]}>
        <boxGeometry args={[BOARD_WIDTH + BORDER * 2, BOARD_HEIGHT + BORDER * 2, MOULDING_DEPTH]} />
        <meshStandardMaterial color="#3c3226" roughness={0.55} metalness={0.04} />
      </mesh>
      <mesh
        name="whiteboard"
        position={[0, 0, MOULDING_DEPTH + PICTURE_PROUD]}
        {...bind}
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.38}
          metalness={0}
          emissiveMap={texture}
          emissive="#ffffff"
          // Brighter than `CabinPictures`' 0.22: those are photographs meant
          // to look lit by the cabin, this is meant to be *read*, and the
          // titles have to stay legible even in the dim daylight-below-deck
          // rig `PortfolioWorld.tsx` lights the cabin with.
          emissiveIntensity={hovered && focus === 'whiteboard' ? 0.34 : 0.28}
        />
      </mesh>

      {/* The dry-wipe marker and its tray — two boxes and a cylinder, and
          the detail that makes this read as a whiteboard rather than a
          plain white rectangle on the wall. Sits below the frame, proud of
          the wall the same way the frame is. */}
      <mesh
        name="whiteboard_tray"
        position={[0, -BOARD_HEIGHT / 2 - BORDER - 0.018, MOULDING_DEPTH * 1.4]}
      >
        <boxGeometry args={[0.14, 0.006, MOULDING_DEPTH * 2.8]} />
        <meshStandardMaterial color="#5a4a36" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh
        name="whiteboard_tray_lip"
        position={[0, -BOARD_HEIGHT / 2 - BORDER - 0.012, MOULDING_DEPTH * 2.6]}
      >
        <boxGeometry args={[0.14, 0.014, 0.006]} />
        <meshStandardMaterial color="#5a4a36" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh
        name="whiteboard_marker"
        position={[0.02, -BOARD_HEIGHT / 2 - BORDER - 0.005, MOULDING_DEPTH * 2.0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.006, 0.006, 0.09, 12]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.4} metalness={0.1} />
      </mesh>
    </group>
  )
}

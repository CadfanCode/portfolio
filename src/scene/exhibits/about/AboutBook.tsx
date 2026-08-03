import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CanvasTexture,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { Mesh as MeshType, MeshBasicMaterial } from 'three'
import modelUrl from '../../../assets/models/maxi77.glb?url'
import hikingUrl from '../../../assets/textures/about/hiking.jpg?url'
import skiingUrl from '../../../assets/textures/about/skiing.jpg?url'
import runningUrl from '../../../assets/textures/about/running.jpg?url'
import { ABOUT_PAGES } from '../../../content/about'
import { useQualityStore } from '../../../state/useQualityStore'
import { prefersReducedMotion } from '../../introFlight'
import { clamp01 } from '../../mathUtils'
import type { ExhibitSceneProps } from '../types'
import type { AboutPagePhotos } from './renderAboutPage'
import { renderAboutPage } from './renderAboutPage'
import { useAboutBook } from './useAboutBook'

/**
 * The resume, staged as a physical book: slides off the shelf, flies round to
 * face the camera, opens to the current spread. Everything is driven off one
 * scripted `t` in `progress` — see the module doc in the task brief this was
 * built from, and `CameraRig`'s own authored-path philosophy, which this
 * mirrors at book scale rather than boat scale.
 */

// ---------------------------------------------------------------------------
// Geometry. Page ratio (0.105:0.148) matches the canvas the pages are drawn
// on (1024:1448) so the texture maps on without stretching.
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 0.105
const PAGE_HEIGHT = 0.148
const COVER_OVERHANG = 0.006
const COVER_WIDTH = PAGE_WIDTH + COVER_OVERHANG
const COVER_HEIGHT = PAGE_HEIGHT + COVER_OVERHANG * 2
const COVER_THICKNESS = 0.004
const BLOCK_THICKNESS = 0.014
const SPINE_WIDTH = 0.012
/** How far in front of the block's own half-thickness the open pages and the
 *  closed cover sit — small but distinct offsets, so covers close over
 *  pages rather than z-fighting with them. */
const PAGE_REST_Z = BLOCK_THICKNESS / 2 + 0.0006
const COVER_REST_Z = BLOCK_THICKNESS / 2 + COVER_THICKNESS / 2 + 0.0012

/** The turning leaf's two faces sit this far apart — enough to dodge
 *  z-fighting, thin enough to read as one sheet of paper. */
const LEAF_GAP = 0.0004

const COVER_COLOUR = '#8a6a45'
const SPINE_COLOUR = '#5f4527'
const EDGE_COLOUR = '#efe6d2'

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const DURATION_OPEN = 1.1
const DURATION_CLOSE = 0.8
/** `prefers-reduced-motion` keeps the feature — the book still moves through
 *  the same states — but collapses the travel time close to a cut. */
const REDUCED_DURATION = 0.12

const SLIDE_START = 0
const SLIDE_END = 0.3
const FLY_START = 0.22
const FLY_END = 0.77
const OPEN_START = 0.55
const OPEN_END = 1

/** How far out of the slot the book slides, and how much it lifts, before
 *  the flight to the presentation pose takes over — enough to clear the
 *  fiddle rail and the neighbouring spines. */
const SLIDE_DISTANCE = 0.16
const SLIDE_LIFT = 0.05

/** Distance the presentation pose is placed at is solved from the camera's
 *  own FOV; these are the fractions of the viewport the open spread should
 *  fill on the tighter of the two axes. */
const TARGET_HEIGHT_FRACTION = 0.96
const TARGET_WIDTH_FRACTION = 0.97
/** Tip the top of the book away from the camera, like it's held up to read
 *  rather than presented flat-on. Negative: see the sign derivation below. */
const READING_TILT = MathUtils.degToRad(-18)

/** Cheap sine bend, not a cloth solver — peaks mid-turn, flat at both ends. */
const CURL_AMPLITUDE = 0.022
const TURN_DURATION = 0.75

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Eased local progress through `[start, end]` of the overall `t`, clamped
 *  to 0 before it and 1 after — the building block every phase below uses. */
function phaseEase(t: number, start: number, end: number): number {
  return easeInOutCubic(clamp01((t - start) / (end - start)))
}

function findMesh(root: Object3D, name: string): MeshType | null {
  let found: MeshType | null = null
  root.traverse((o) => {
    if (!found && o instanceof Mesh && o.name === name) found = o
  })
  return found
}

/** The book's start pose, read off the `book_about` shelf slot rather than
 *  hardcoded. Position only — the mesh's local axes already line up with the
 *  book-local frame this component builds in (spine vertical, pages
 *  extending +X from it, thickness along Z), the same assumption
 *  `BookSpines.tsx` makes when it treats this mesh's box directly in model
 *  space. `null` when the node is missing, so the caller can fail soft. */
function readShelfSlot(model: Object3D): Vector3 | null {
  const mesh = findMesh(model, 'book_about')
  if (!mesh) return null
  model.updateMatrixWorld(true)
  mesh.updateWorldMatrix(true, false)
  const toModel = new Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld)
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  if (!box) return null
  const local = box.clone().applyMatrix4(toModel)
  const centre = local.getCenter(new Vector3())
  // The spine face is the outboard one — `BookSpines.tsx` grows its hit box
  // further in -x from `box.min.x` to reach into the open air in front of
  // the shelf, which is what fixes which face is the spine.
  return new Vector3(local.min.x, centre.y, centre.z)
}

type TextureBundle = {
  left: CanvasTexture[]
  right: CanvasTexture[]
}

/** True once the Caveat webfont (loaded in `index.html`) is confirmed ready.
 *  Starts from `document.fonts.check` for the fast path (already loaded, the
 *  common case once the visitor has been on the page a few seconds), then
 *  falls back to `document.fonts.load` for the first-ever open. */
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

/**
 * Builds and memoises the ten page textures, five to a side.
 *
 * Keyed on `pageScale`, `photos` and `fontReady` — not anisotropy, see the
 * note on that below. Ten pages at 1024×1448 is roughly 59 MB of RGBA VRAM,
 * rasterised on the main thread the moment the
 * book opens — the single largest allocation in the app, and a real failure
 * mode on a memory-starved phone — so this memo exists specifically to avoid
 * doing that rasterisation more than once (beyond the one unavoidable
 * rebuild `fontReady` forces if the font wasn't ready yet on first open).
 * `pageScale` belongs in the key because it changes what gets drawn onto the
 * canvas; anisotropy does not,
 * since it is a property that can be set on an already-rendered texture
 * without touching the canvas at all — see the `useEffect` below, which
 * applies it separately so a tier change would not force all ten pages to
 * be re-rasterised.
 */
function usePageTextures(
  pageScale: number,
  photos: AboutPagePhotos,
  fontReady: boolean,
): TextureBundle {
  return useMemo(() => {
    const left: CanvasTexture[] = []
    const right: CanvasTexture[] = []
    for (let spread = 0; spread < ABOUT_PAGES.length / 2; spread++) {
      const leftPage = ABOUT_PAGES[spread * 2]
      const rightPage = ABOUT_PAGES[spread * 2 + 1]
      const leftCanvas = renderAboutPage(leftPage, 'left', photos, pageScale)
      const rightCanvas = renderAboutPage(rightPage, 'right', photos, pageScale)
      const leftTex = new CanvasTexture(leftCanvas)
      const rightTex = new CanvasTexture(rightCanvas)
      leftTex.colorSpace = SRGBColorSpace
      rightTex.colorSpace = SRGBColorSpace
      left.push(leftTex)
      right.push(rightTex)
    }
    return { left, right }
    // `fontReady` is deliberately unread inside this callback; it exists
    // solely as a dependency-array trigger that forces exactly one rebuild
    // once the Caveat webfont finishes loading after a first-ever open (see
    // `useHandFontReady`'s doc comment for why that rebuild matters).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pageScale, photos, fontReady])
}

/**
 * Solves the presentation distance from the camera's actual FOV and aspect,
 * targeting the tighter of a height and a width constraint so the spread
 * fills the frame on both a portrait phone and a wide monitor.
 */
function presentationDistance(camera: PerspectiveCamera): number {
  const vFov = MathUtils.degToRad(camera.fov)
  const halfTan = Math.tan(vFov / 2)
  const spreadHeight = PAGE_HEIGHT
  const spreadWidth = PAGE_WIDTH * 2

  const dForHeight = spreadHeight / (TARGET_HEIGHT_FRACTION * 2 * halfTan)
  const dForWidth = spreadWidth / (TARGET_WIDTH_FRACTION * 2 * halfTan * camera.aspect)
  return Math.max(dForHeight, dForWidth)
}

export function AboutBook({ active, onExited }: ExhibitSceneProps) {
  const { scene: model } = useGLTF(modelUrl)
  const gl = useThree((s) => s.gl)

  const spread = useAboutBook((s) => s.spread)
  const turning = useAboutBook((s) => s.turning)
  const finishTurn = useAboutBook((s) => s.finishTurn)
  const reset = useAboutBook((s) => s.reset)

  // The about book only ever opens from inside the `books` close-up, so the
  // close-up budget applies unconditionally — no branching on `focus` needed.
  const pageScale = useQualityStore((s) => s.settings.focus.pageScale)
  const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)
  const photoTextures = useTexture({ hiking: hikingUrl, skiing: skiingUrl, running: runningUrl })
  const photos = useMemo<AboutPagePhotos>(
    () => ({
      // TextureLoader's `.image` is always an HTMLImageElement for a
      // standard raster load — the type stays generic on `Texture` to also
      // cover video/canvas sources, which don't apply here.
      hiking: photoTextures.hiking.image as HTMLImageElement,
      skiing: photoTextures.skiing.image as HTMLImageElement,
      running: photoTextures.running.image as HTMLImageElement,
    }),
    // Individual textures, not the `photoTextures` wrapper object — drei's
    // cache guarantees the same URL resolves to the same `Texture` instance
    // across renders, but says nothing about the identity of the plain
    // object `useTexture` wraps them in, and that object is what this memo
    // must not spuriously rebuild on (each rebuild re-rasterises all ten
    // pages — see `usePageTextures`'s own doc comment on why that's costly).
    [photoTextures.hiking, photoTextures.skiing, photoTextures.running],
  )
  const fontReady = useHandFontReady()
  const textures = usePageTextures(pageScale, photos, fontReady)
  useEffect(() => {
    return () => {
      textures.left.forEach((t) => t.dispose())
      textures.right.forEach((t) => t.dispose())
    }
  }, [textures])

  // Anisotropy is applied here rather than folded into `usePageTextures`'
  // memo key — see the note on that hook — so it can change without forcing
  // the eight pages to be re-rasterised. The GPU's own maximum still wins
  // where it is lower than the tier's ceiling.
  useEffect(() => {
    const cap = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    for (const tex of [...textures.left, ...textures.right]) {
      tex.anisotropy = cap
      tex.needsUpdate = true
    }
  }, [textures, anisotropy, gl])

  const shelfSlot = useMemo(() => readShelfSlot(model), [model])

  // The turning leaf's shared geometry — shared between its two faces
  // (below) so the one curl deformation drives both without computing it
  // twice, and mutated in place each frame rather than rebuilt, in keeping
  // with "allocate outside the loop, mutate inside it".
  const turningGeometry = useMemo(() => new PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 24, 1), [])
  useEffect(() => () => turningGeometry.dispose(), [turningGeometry])

  const rootRef = useRef<Group>(null)
  const frontHingeRef = useRef<Group>(null)
  const turnHingeRef = useRef<Group>(null)
  const turnFaceARef = useRef<MeshBasicMaterial>(null)
  const turnFaceBRef = useRef<MeshBasicMaterial>(null)
  const staticLeftRef = useRef<MeshBasicMaterial>(null)
  const staticRightRef = useRef<MeshBasicMaterial>(null)

  /** The single scripted clock everything else reads from. 0 = shelved and
   *  closed, 1 = presented and open. */
  const progress = useRef(0)
  const wasActive = useRef(false)
  const exitedRef = useRef(false)
  /** Captured once per opening — see `ExhibitSceneProps.active`'s own note
   *  on why a fixed pose beats a chased one. Null until the first frame
   *  `active` goes true, and re-captured every time it does, so re-opening
   *  after the visitor has moved elsewhere reframes correctly. */
  const presentationPose = useRef<{ position: Vector3; quaternion: Quaternion } | null>(null)

  /** Turn progress within the current turn, 0..1 — kept out of the zustand
   *  store for the same reason `progress` is: it runs every frame. */
  const turnProgress = useRef(0)

  // Scratch objects, allocated once and mutated every frame rather than
  // reallocated — see the project's rule on vectors in `useFrame`.
  const tmpForward = useRef(new Vector3()).current
  const tmpCamPos = useRef(new Vector3()).current
  const tmpCamQuat = useRef(new Quaternion()).current
  const tmpRight = useRef(new Vector3()).current
  const tmpUp = useRef(new Vector3()).current
  const tmpBasis = useRef(new Matrix4()).current
  const tmpTilt = useRef(new Quaternion()).current
  const tmpParentQuat = useRef(new Quaternion()).current
  const tmpParentQuatInv = useRef(new Quaternion()).current
  const tmpParentMatInv = useRef(new Matrix4()).current
  const tmpPos = useRef(new Vector3()).current
  const tmpQuat = useRef(new Quaternion()).current

  useFrame((state, delta) => {
    const root = rootRef.current
    if (!root) return

    const reduced = prefersReducedMotion()
    const openDur = reduced ? REDUCED_DURATION : DURATION_OPEN
    const closeDur = reduced ? REDUCED_DURATION : DURATION_CLOSE

    if (active) {
      if (!wasActive.current) {
        // Freshly opened: capture the presentation pose once from wherever
        // the camera actually is right now, in world space, then convert it
        // into this group's parent space (the rocking boat frame) so it can
        // be applied as an ordinary local transform every frame after.
        const camera = state.camera as PerspectiveCamera
        camera.getWorldPosition(tmpCamPos)
        camera.getWorldQuaternion(tmpCamQuat)
        tmpForward.set(0, 0, -1).applyQuaternion(tmpCamQuat)

        const distance = presentationDistance(camera)
        tmpPos.copy(tmpCamPos).addScaledVector(tmpForward, distance)

        // Face the camera: local +Z looks back along -forward. Built as an
        // explicit basis (not a lookAt matrix, which assumes -Z is forward)
        // because this object's canonical forward is +Z, the same
        // convention the rest of this file's geometry uses for "toward the
        // reader".
        const bookZ = tmpForward.clone().negate()
        tmpUp.set(0, 1, 0).applyQuaternion(tmpCamQuat)
        tmpRight.crossVectors(tmpUp, bookZ).normalize()
        tmpUp.crossVectors(bookZ, tmpRight).normalize()
        tmpBasis.makeBasis(tmpRight, tmpUp, bookZ)
        tmpQuat.setFromRotationMatrix(tmpBasis)
        // Tilt back around the book's own (now-oriented) right axis, so it
        // reads as held up to the reader rather than presented dead flat.
        tmpTilt.setFromAxisAngle(tmpRight, READING_TILT)
        tmpQuat.premultiply(tmpTilt)

        const parent = root.parent
        if (parent) {
          parent.updateWorldMatrix(true, false)
          parent.getWorldQuaternion(tmpParentQuat)
          tmpParentQuatInv.copy(tmpParentQuat).invert()
          tmpParentMatInv.copy(parent.matrixWorld).invert()
          tmpPos.applyMatrix4(tmpParentMatInv)
          tmpQuat.premultiply(tmpParentQuatInv)
        }

        presentationPose.current = {
          position: tmpPos.clone(),
          quaternion: tmpQuat.clone(),
        }
        exitedRef.current = false
      }
      progress.current = Math.min(1, progress.current + delta / openDur)
    } else {
      progress.current = Math.max(0, progress.current - delta / closeDur)
      if (progress.current === 0 && !exitedRef.current) {
        exitedRef.current = true
        // Reset here, not the instant `active` goes false: the cover is
        // still open at the start of the close animation, so resetting the
        // spread eagerly would flash the title page back into view before
        // the cover has swung shut over it. Waiting for the book to be
        // fully retracted means the reset happens off-screen.
        reset()
        onExited()
      }
    }
    wasActive.current = active

    const t = progress.current
    const pose = presentationPose.current

    if (pose) {
      if (shelfSlot) {
        // Phase 1: straight out of the slot, along the shelf's own outward
        // direction (-x — see `readShelfSlot`), with a slight lift.
        const slideT = phaseEase(t, SLIDE_START, SLIDE_END)
        tmpPos.set(
          shelfSlot.x - SLIDE_DISTANCE * slideT,
          shelfSlot.y + SLIDE_LIFT * slideT,
          shelfSlot.z,
        )
        // Phase 2: fly and turn onto the presentation pose. Position lerps;
        // orientation slerps from identity (the shelf never rotates the
        // book) to the captured pose — never through Euler angles.
        const flyT = phaseEase(t, FLY_START, FLY_END)
        tmpPos.lerp(pose.position, flyT)
        tmpQuat.identity().slerp(pose.quaternion, flyT)
      } else {
        // No shelf slot found: fail soft and fade in at the presentation
        // pose instead of throwing or freezing on a missing node.
        tmpPos.copy(pose.position)
        tmpQuat.copy(pose.quaternion)
      }
      root.position.copy(tmpPos)
      root.quaternion.copy(tmpQuat)
      root.visible = true
      const fade = shelfSlot ? 1 : phaseEase(t, SLIDE_START, FLY_START)
      root.scale.setScalar(shelfSlot ? 1 : MathUtils.lerp(0.001, 1, fade))
    } else {
      root.visible = false
    }

    // Phase 3: the covers swing open.
    const coverT = phaseEase(t, OPEN_START, OPEN_END)
    if (frontHingeRef.current) frontHingeRef.current.rotation.y = coverT * Math.PI

    // Page turn, if one is running. `turnProgress` is a local animation
    // clock, separate from the book's own open/close `t` — a visitor can
    // only turn pages once the book is fully open, but the turn itself
    // still has to run at its own pace regardless of how `t` behaves.
    if (turning) {
      turnProgress.current = Math.min(1, turnProgress.current + delta / TURN_DURATION)
      const eased = easeInOutCubic(turnProgress.current)
      const angle =
        turning === 'forward' ? eased * Math.PI : Math.PI - eased * Math.PI
      if (turnHingeRef.current) turnHingeRef.current.rotation.y = angle

      const bend = CURL_AMPLITUDE * Math.sin(Math.PI * turnProgress.current)
      const position = turningGeometry.attributes.position
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const u = x / PAGE_WIDTH + 0.5
        position.setZ(i, bend * Math.sin(Math.PI * u))
      }
      position.needsUpdate = true
      // No normals recomputed: both leaf faces are unlit basic materials, so
      // nothing downstream reads them and doing it per frame is pure cost.

      if (turnProgress.current >= 1) {
        finishTurn()
        turnProgress.current = 0
      }
    } else {
      turnProgress.current = 0
    }
  })

  // Derived display indices — see `useResumeBook.ts` for why the "hidden"
  // counterpart swaps the instant a turn starts (it's occluded by the
  // turning leaf the whole time) while the "revealed" one only swaps at the
  // very end, once the leaf has settled onto it.
  const leftIndex = turning === 'backward' ? spread - 1 : spread
  const rightIndex = turning === 'forward' ? spread + 1 : spread

  const turnTexA =
    turning === 'forward'
      ? textures.right[spread]
      : turning === 'backward'
        ? textures.right[spread - 1]
        : undefined
  const turnTexB =
    turning === 'forward'
      ? textures.left[spread + 1]
      : turning === 'backward'
        ? textures.left[spread]
        : undefined

  useEffect(() => {
    if (staticLeftRef.current) staticLeftRef.current.needsUpdate = true
    if (staticRightRef.current) staticRightRef.current.needsUpdate = true
  }, [leftIndex, rightIndex])

  useEffect(() => {
    if (turnFaceARef.current) turnFaceARef.current.needsUpdate = true
    if (turnFaceBRef.current) turnFaceBRef.current.needsUpdate = true
  }, [turnTexA, turnTexB])

  return (
    <group ref={rootRef} visible={false}>
      {/* Static parts: the block of pages, the spine, the back cover, and
          the currently-open spread. None of these hinge. */}
      <mesh position={[PAGE_WIDTH / 2, 0, 0]}>
        <boxGeometry args={[PAGE_WIDTH, PAGE_HEIGHT - 0.004, BLOCK_THICKNESS]} />
        <meshStandardMaterial color={EDGE_COLOUR} roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[PAGE_WIDTH / 2, 0, -COVER_REST_Z]}>
        <boxGeometry args={[COVER_WIDTH, COVER_HEIGHT, COVER_THICKNESS]} />
        <meshStandardMaterial color={COVER_COLOUR} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[SPINE_WIDTH, COVER_HEIGHT, BLOCK_THICKNESS + COVER_THICKNESS * 2]} />
        <meshStandardMaterial color={SPINE_COLOUR} roughness={0.6} metalness={0.05} />
      </mesh>

      <mesh position={[PAGE_WIDTH / 2, 0, PAGE_REST_Z]}>
        <planeGeometry args={[PAGE_WIDTH, PAGE_HEIGHT]} />
        <meshBasicMaterial ref={staticRightRef} map={textures.right[rightIndex]} toneMapped={false} />
      </mesh>
      {/* The front cover, hinged at the spine — and the left-hand page with
          it. The page rides the hinge rather than standing on its own so that
          a closed book is actually closed: parked on its own at -x it would
          hang in the air beside the shut covers all the way across the cabin.
          Mirrored (rot Y = pi) and pushed to -z here so the hinge's own half
          turn lands it face-up at +x/-x flipped — i.e. flat on top of the
          opened cover, reading the right way round. */}
      <group ref={frontHingeRef}>
        <mesh position={[COVER_WIDTH / 2, 0, COVER_REST_Z]}>
          <boxGeometry args={[COVER_WIDTH, COVER_HEIGHT, COVER_THICKNESS]} />
          <meshStandardMaterial color={COVER_COLOUR} roughness={0.6} metalness={0.05} />
        </mesh>
        <mesh position={[PAGE_WIDTH / 2, 0, -PAGE_REST_Z]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[PAGE_WIDTH, PAGE_HEIGHT]} />
          <meshBasicMaterial ref={staticLeftRef} map={textures.left[leftIndex]} toneMapped={false} />
        </mesh>
      </group>

      {/* The turning leaf — two back-to-back faces on one shared, curled
          geometry. Only mounted mid-turn; static otherwise. */}
      {turning && (
        <group ref={turnHingeRef}>
          <mesh position={[PAGE_WIDTH / 2, 0, LEAF_GAP]} geometry={turningGeometry}>
            <meshBasicMaterial ref={turnFaceARef} map={turnTexA} toneMapped={false} />
          </mesh>
          <mesh
            position={[PAGE_WIDTH / 2, 0, -LEAF_GAP]}
            rotation={[0, Math.PI, 0]}
            geometry={turningGeometry}
          >
            <meshBasicMaterial ref={turnFaceBRef} map={turnTexB} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  )
}

useTexture.preload([hikingUrl, skiingUrl, runningUrl])

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  MathUtils,
  Matrix4,
  Mesh,
  Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { Mesh as MeshType, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import modelUrl from '../assets/models/maxi77.glb?url'
import { useSceneStore } from '../state/useSceneStore'
import { useComingSoonStore } from '../state/useComingSoonStore'
import { useParrotStore, ATTRACT_OSCILLATION_MS } from '../parrot/useParrotStore'
import { useQualityStore } from '../state/useQualityStore'
import { usePointerSelect } from './usePointerSelect'

/**
 * Gilt titles on the placeholder book spines, and a per-book glow that lets
 * the pointer tell them apart where they stand 36 mm apart.
 *
 * The titles are drawn on a 2D canvas rather than set with a text component:
 * there are no fonts in this repo, and a spine reading top-to-bottom is a
 * rotated, letter-spaced fill on a plane, which a canvas does in a few lines
 * without a CDN fetch. The glow reuses each book's own case geometry rather
 * than a proxy box, so the highlight is the book's exact silhouette and not
 * a rectangle floating near it — neighbouring spines are close enough that a
 * box would read as lighting up the gap between them.
 *
 * The books only respond once the camera has actually arrived at the shelf
 * close-up (`focus === 'books'`) — entering that close-up is still the box
 * proxy's job in `FocusTargets`, this component only owns what happens once
 * you are already there. A single highlight slot lives in `BookSpines`, not
 * in each `BookSpine`, so "two books lit at once" is impossible by
 * construction rather than something each book has to avoid on its own.
 */

type BookSpineDef = {
  node: string
  title: string
  /** Exhibit id opened on selection. Omit for the sticky-glow placeholder. */
  exhibit?: string
  /** External URL opened in a new tab on selection, for books that link out
   *  rather than staging an in-scene exhibit. */
  url?: string
}

// Shelf order is the model's, not this list's — `blender/fitout.py`'s
// `_BOOK_TAIL` puts two ordinary books between `book_about` and `book_github`,
// so the third one reads as found on the shelf rather than bolted on beside
// the other two. Reordering here changes nothing about where they stand.
const BOOKS: readonly BookSpineDef[] = [
  { node: 'book_resume', title: 'My Resume', exhibit: 'resume' },
  { node: 'book_about', title: 'About Me', exhibit: 'about' },
  { node: 'book_github', title: 'Github', url: 'https://github.com/CadfanCode' },
]

/** Colour of the lettering and its glow — the warm gilt band the model paints
 *  onto real book edges elsewhere, so the spines read as part of the same set. */
const GILT_COLOUR = '#d9b978'

/** Colour of the attract blink, distinct from `GILT_COLOUR` so it reads as a
 *  different kind of signal — "look here" — rather than the ordinary
 *  hover/selected affordance. */
const BLINK_COLOUR = '#ffd400'

// Scratch `Color` instances for the per-frame gilt↔blink lerp in
// `BookSpine`'s `useFrame` below, hoisted to module scope rather than
// allocated per frame or per component instance — same convention as
// `CameraRig.tsx`'s `eye`/`pivot`/`aim` and `IntroClouds.tsx`'s `fallbackColor`.
const GILT_COLOUR_OBJ = new Color(GILT_COLOUR)
const BLINK_COLOUR_OBJ = new Color(BLINK_COLOUR)
const scratchColour = new Color()

function findMesh(root: Object3D, name: string): MeshType | null {
  let found: MeshType | null = null
  root.traverse((o) => {
    if (!found && o instanceof Mesh && o.name === name) found = o
  })
  return found
}

/** Name of the pooled gilt-band mesh (`_book_gilt` in `blender/fitout.py`) —
 *  four boxes, two per book, sharing one mesh and an identity transform. */
const GILT_MESH_NAME = 'book_gilt'

/** Tolerance, in model-space metres, for matching a vertex's z to a book's
 *  own z span — the bands are inset 4 mm from the spine ends, comfortably
 *  inside a 1 mm slop, but floating point on an exported mesh is not exact. */
const GILT_Z_TOLERANCE = 0.001

/** Gap, in metres, above which two band y-values are treated as separate
 *  intervals rather than the same band — bigger than a 4 mm band's own
 *  thickness, smaller than the 25 mm clearance between the two bands. */
const GILT_MERGE_GAP = 0.006

/** Inset, in metres, eaten off each end of the chosen clear panel so the
 *  lettering does not run flush against a gilt band's edge. */
const PANEL_INSET = 0.004

/** Name of the joined shelf-board-and-fiddle-rail mesh (`shelf` in the
 *  exported GLB) — port and starboard, board and rail, are one lofted mesh,
 *  so the rail has to be isolated by coordinate rather than by node name. */
const SHELF_MESH_NAME = 'shelf'

/** How far inboard of the spine face, in metres, a vertex still counts as
 *  belonging to the fiddle rail rather than open air. The rail itself is
 *  only ~22 mm deep, so 60 mm comfortably covers it; it also stays well
 *  short of the port-side shelf's own rail (around x = -1.0), which is
 *  identically tall and would make a looser filter look like it worked for
 *  the wrong reason. */
const RAIL_X_REACH = 0.06

/** How far past a book's own z span, in metres, the rail lookup widens its
 *  search. The shelf is lofted from rings roughly 70 mm apart, while a book
 *  is only 32-36 mm wide, so a book's exact z span can miss every ring; this
 *  pads past one ring spacing on each side so the search always finds one. */
const RAIL_Z_PAD = 0.08

type Interval = { min: number; max: number }

/**
 * Reads the gilt bands belonging to one book off the pooled `book_gilt`
 * mesh, filtering its vertices to this book's z slice and collapsing them
 * into y intervals. Returns `[]` if the mesh is missing, so callers can
 * fall back to centring on the whole spine.
 */
function readGiltBands(model: Object3D, zMin: number, zMax: number): Interval[] {
  const gilt = findMesh(model, GILT_MESH_NAME)
  if (!gilt) return []

  model.updateMatrixWorld(true)
  gilt.updateWorldMatrix(true, false)
  const toModel = new Matrix4().copy(model.matrixWorld).invert().multiply(gilt.matrixWorld)

  const position = gilt.geometry.getAttribute('position')
  const v = new Vector3()
  const ys: number[] = []
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(toModel)
    if (v.z >= zMin - GILT_Z_TOLERANCE && v.z <= zMax + GILT_Z_TOLERANCE) {
      ys.push(v.y)
    }
  }
  ys.sort((a, b) => a - b)

  const intervals: Interval[] = []
  for (const y of ys) {
    const last = intervals[intervals.length - 1]
    if (last && y - last.max <= GILT_MERGE_GAP) {
      last.max = y
    } else {
      intervals.push({ min: y, max: y })
    }
  }
  return intervals
}

/**
 * Reads the fiddle rail standing in front of one book off the pooled
 * `shelf` mesh (board and rail, port and starboard, are one lofted mesh —
 * see `SHELF_MESH_NAME`), filtering its vertices to the narrow x slice the
 * rail alone occupies and a z window widened past the loft's ring spacing.
 * Returns the highest surviving y, since the rail's scalloped top edge and
 * its own few millimetres of drift along the run mean the tallest nearby
 * crest is the only answer that is above the rail everywhere along the
 * book. Returns `null` if the mesh is missing or nothing survives the
 * filter, so callers can fall back to measuring from the book's own foot.
 */
function readShelfRailTop(
  model: Object3D,
  spineFaceX: number,
  zMin: number,
  zMax: number,
): number | null {
  const shelf = findMesh(model, SHELF_MESH_NAME)
  if (!shelf) return null

  model.updateMatrixWorld(true)
  shelf.updateWorldMatrix(true, false)
  const toModel = new Matrix4().copy(model.matrixWorld).invert().multiply(shelf.matrixWorld)

  const position = shelf.geometry.getAttribute('position')
  const v = new Vector3()
  let railTop: number | null = null
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(toModel)
    if (
      v.x < spineFaceX &&
      v.x > spineFaceX - RAIL_X_REACH &&
      v.z >= zMin - RAIL_Z_PAD &&
      v.z <= zMax + RAIL_Z_PAD
    ) {
      railTop = railTop === null ? v.y : Math.max(railTop, v.y)
    }
  }
  return railTop
}

/**
 * The tallest y-span left clear once the book's gilt bands are cut out of
 * its own y extent — the field a title actually gets set in, not the
 * spine's full height. A title reading top-to-bottom needs length, and the
 * 25 mm gap between the two bands cannot hold one at a legible size, so the
 * panel below the lower band (the tallest of the three clear fields) wins.
 * Callers narrow `spineMin` past the book's own foot to the fiddle rail's
 * top (`readShelfRailTop`) where one was found, since the rail — not the
 * shelf board — is the field's real lower edge; the foot is only the
 * fallback for a book the rail lookup could not place.
 */
function tallestClearPanel(spineMin: number, spineMax: number, bands: Interval[]): Interval {
  if (bands.length === 0) return { min: spineMin, max: spineMax }

  const sorted = [...bands].sort((a, b) => a.min - b.min)
  const clear: Interval[] = []
  let cursor = spineMin
  for (const band of sorted) {
    if (band.min > cursor) clear.push({ min: cursor, max: band.min })
    cursor = Math.max(cursor, band.max)
  }
  if (spineMax > cursor) clear.push({ min: cursor, max: spineMax })

  let tallest = clear[0] ?? { min: spineMin, max: spineMax }
  for (const panel of clear) {
    if (panel.max - panel.min > tallest.max - tallest.min) tallest = panel
  }

  const inset = Math.min(PANEL_INSET, (tallest.max - tallest.min) / 2 - 1e-4)
  return { min: tallest.min + inset, max: tallest.max - inset }
}

/** Renders a spine title, top-to-bottom, shrunk to fit the plane's aspect. */
function drawSpineCanvas(title: string, aspect: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const height = 1024
  const width = Math.max(16, Math.round(height * aspect))
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const text = title.toUpperCase()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = GILT_COLOUR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if ('letterSpacing' in ctx) {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '4px'
  }

  // Shrink from a generous starting size until the text fits the spine's
  // length (the canvas height, since the text runs rotated along it).
  let size = Math.round(width * 0.55)
  ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`
  while (ctx.measureText(text).width > height * 0.82 && size > 8) {
    size -= 2
    ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`
  }

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate(Math.PI / 2)
  ctx.fillText(text, 0, 0)
  ctx.restore()

  return canvas
}

/** Rest, hover and selected emissive intensity for the gilt lettering, and
 *  the opacities the glow damps toward — kept together since all of them
 *  track the shared highlight/selection slot rather than a local `hovered`. */
const TITLE_REST_INTENSITY = 0.15
const TITLE_HOVER_INTENSITY = 1.2
const TITLE_SELECTED_INTENSITY = 1.5
const GLOW_HOVER_OPACITY = 0.45
const GLOW_SELECTED_OPACITY = 0.55
const DAMP_LAMBDA = 8

type BookSpineProps = BookSpineDef & {
  /** True only once the shelf close-up actually has the camera. */
  interactable: boolean
  /** Whether this book currently owns the single highlight slot. */
  highlighted: boolean
  /** Whether this book currently owns the single selection slot. */
  selected: boolean
  /**
   * True while this book's own exhibit is open. The book has left the shelf
   * for the close-up stage its `Scene` builds, so everything drawn for it
   * here — lettering, glow, hit target — hides rather than sitting behind
   * (or worse, still clickable through) the exhibit.
   */
  exhibitOpen: boolean
  setHighlighted: Dispatch<SetStateAction<string | null>>
  onSelect: (node: string) => void
}

function BookSpine({
  node,
  title,
  interactable,
  highlighted,
  selected,
  exhibitOpen,
  setHighlighted,
  onSelect,
}: BookSpineProps) {
  const { scene: model } = useGLTF(modelUrl)
  const gl = useThree((s) => s.gl)
  const anisotropy = useQualityStore((s) => s.settings.textures.detailAnisotropy)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const attracting = useParrotStore((s) => s.attracting)

  const mesh = useMemo(() => findMesh(model, node), [model, node])

  // The book's own bounding box read in model space, so it holds still under
  // the boat's rocking (`matrixWorld` carries that motion, model space does
  // not) — see `Boat.tsx`'s bare `<primitive object={model} />`, which puts
  // this component's siblings in the same frame as the model's own nodes.
  const layout = useMemo(() => {
    if (!mesh) return null
    model.updateMatrixWorld(true)
    mesh.updateWorldMatrix(true, false)
    const toModel = new Matrix4()
      .copy(model.matrixWorld)
      .invert()
      .multiply(mesh.matrixWorld)
    mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(toModel)
    const centre = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    return { box, centre, size, toModel }
  }, [mesh, model])

  // The label plane's own extent: the tallest field left clear once this
  // book's gilt bands (read off the model, not hardcoded) are cut out of
  // its spine height.
  const panel = useMemo(() => {
    if (!layout) return null
    const bands = readGiltBands(model, layout.box.min.z, layout.box.max.z)
    // The label plane sits just outboard of `box.min.x` (see its position
    // below), so that is the spine face the rail lookup measures inboard
    // from.
    const railTop = readShelfRailTop(model, layout.box.min.x, layout.box.min.z, layout.box.max.z)
    const spineMin = railTop === null ? layout.box.min.y : Math.max(layout.box.min.y, railTop)
    return tallestClearPanel(spineMin, layout.box.max.y, bands)
  }, [layout, model])

  const { hovered, bind } = usePointerSelect({
    enabled: interactable && !isTransitioning,
    onSelect: () => onSelect(node),
  })

  // The pointer-over/out pair still drives the shared slot, not a local
  // `hovered` — this component only reflects what the slot says. The
  // functional update on release means a book only clears the slot if it
  // still owns it, so a fast pointer-over on the other book (which claims
  // the slot first via `stopPropagation`, see the hit target below) cannot
  // be clobbered by this book's later `pointerout`.
  useEffect(() => {
    if (hovered) setHighlighted(node)
    else setHighlighted((current) => (current === node ? null : current))
  }, [hovered, node, setHighlighted])

  // Same idiom as `PortfolioWorld`'s coupling damp: eased per frame rather
  // than switched, so the highlight settles in rather than snapping on.
  const emissiveIntensity = useRef(TITLE_REST_INTENSITY)
  const glowOpacity = useRef(0)
  // How attract-lit this frame is, 0..1 — 1 only when the frame's target came
  // from the `attracting` branch specifically (not `selected`/`lit`), damped
  // the same as the intensity/opacity above so the gilt→yellow colour lerp
  // eases in and out with the same softness rather than snapping.
  const attractLit = useRef(0)
  const material = useRef<MeshStandardMaterial>(null)
  const glowMaterial = useRef<MeshBasicMaterial>(null)

  // Wall-clock time a burst started, so the sine below can phase itself off
  // "time since this burst began" rather than off the render clock directly
  // — the latter would make a burst's first oscillation start mid-cycle
  // depending on when in the global clock `attracting` happened to flip.
  const attractStart = useRef<number | null>(null)
  useEffect(() => {
    attractStart.current = attracting ? performance.now() : null
  }, [attracting])

  useFrame((_state, delta) => {
    const lit = highlighted || selected
    // Hover and selection always win over the attract pulse — a book the
    // visitor is already looking at doesn't need to keep asking for
    // attention, and the flat targets below stay simple to reason about
    // because of it.
    let targetIntensity: number
    let targetOpacity: number
    let targetAttractLit: number
    if (selected) {
      targetIntensity = TITLE_SELECTED_INTENSITY
      targetOpacity = GLOW_SELECTED_OPACITY
      targetAttractLit = 0
    } else if (lit) {
      targetIntensity = TITLE_HOVER_INTENSITY
      targetOpacity = GLOW_HOVER_OPACITY
      targetAttractLit = 0
    } else if (attracting) {
      // `ParrotAssistant.tsx` holds `attracting` true for one whole burst
      // (`ATTRACT_OSCILLATIONS_PER_BURST` cycles of `ATTRACT_OSCILLATION_MS`
      // back to back) rather than toggling per-oscillation, so the pulsing
      // itself is drawn here: a 0→1→0 wave per `ATTRACT_OSCILLATION_MS`,
      // starting at 0 so the burst's first pulse ramps up from rest instead
      // of snapping straight to full brightness.
      const elapsedMs =
        attractStart.current === null ? 0 : performance.now() - attractStart.current
      const pulse = (1 - Math.cos((elapsedMs / ATTRACT_OSCILLATION_MS) * Math.PI * 2)) / 2
      targetIntensity = MathUtils.lerp(TITLE_REST_INTENSITY, TITLE_HOVER_INTENSITY, pulse)
      targetOpacity = GLOW_HOVER_OPACITY * pulse
      targetAttractLit = pulse
    } else {
      targetIntensity = TITLE_REST_INTENSITY
      targetOpacity = 0
      targetAttractLit = 0
    }

    emissiveIntensity.current = MathUtils.damp(
      emissiveIntensity.current,
      targetIntensity,
      DAMP_LAMBDA,
      delta,
    )
    if (material.current) material.current.emissiveIntensity = emissiveIntensity.current

    glowOpacity.current = MathUtils.damp(glowOpacity.current, targetOpacity, DAMP_LAMBDA, delta)
    if (glowMaterial.current) glowMaterial.current.opacity = glowOpacity.current

    attractLit.current = MathUtils.damp(attractLit.current, targetAttractLit, DAMP_LAMBDA, delta)
    if (material.current) {
      material.current.emissive.copy(
        scratchColour.copy(GILT_COLOUR_OBJ).lerp(BLINK_COLOUR_OBJ, attractLit.current),
      )
    }
    if (glowMaterial.current) {
      glowMaterial.current.color.copy(
        scratchColour.copy(GILT_COLOUR_OBJ).lerp(BLINK_COLOUR_OBJ, attractLit.current),
      )
    }
  })

  const planeWidth = layout ? layout.size.z * 0.8 : 1
  const planeHeight = panel ? panel.max - panel.min : 1
  const aspect = planeWidth / Math.max(planeHeight, 1e-4)

  const texture = useMemo(() => {
    const canvas = drawSpineCanvas(title, aspect)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    // The tier is a ceiling, not a demand — the GPU's own maximum still wins
    // where it is lower.
    tex.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
    return tex
  }, [title, aspect, anisotropy, gl])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  if (!mesh || !layout || !panel || exhibitOpen) return null

  const { box, centre, toModel } = layout
  const panelCentreY = (panel.min + panel.max) / 2

  // Hit target: `box` widened so it juts into the open air in front of the
  // spine rather than sitting flush with it — 36 mm apart, two flush boxes
  // would be nearly impossible to tell apart with a mouse.
  const hitBox = box.clone()
  hitBox.min.y -= 0.008
  hitBox.max.y += 0.008
  hitBox.min.z -= 0.002
  hitBox.max.z += 0.002
  hitBox.min.x -= 0.025
  const hitCentre = hitBox.getCenter(new Vector3())
  const hitSize = hitBox.getSize(new Vector3())

  return (
    <group>
      {/* a) The lettering, always rendered — visible whenever the shelf is.
          Centred on the clear panel below the gilt bands, not the spine's
          own centre, so the title sits in the field it actually fits. */}
      <mesh
        position={[box.min.x - 0.0015, panelCentreY, centre.z]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshStandardMaterial
          ref={material}
          map={texture}
          emissiveMap={texture}
          emissive={GILT_COLOUR}
          emissiveIntensity={TITLE_REST_INTENSITY}
          metalness={0.75}
          roughness={0.35}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* b) The glow, in the book's own silhouette. Mounted whenever it might
          have something to show — the close-up (`interactable`) or the
          attract blink, which fires from anywhere in the cabin, not just
          once the camera has arrived at the shelf — so the nudge lights the
          whole book, not just the always-rendered title plane above. */}
      {(interactable || attracting) && (
        <mesh
          geometry={mesh.geometry}
          matrixAutoUpdate={false}
          onUpdate={(m) => m.matrix.copy(toModel)}
          raycast={() => null}
        >
          <meshBasicMaterial
            ref={glowMaterial}
            color={GILT_COLOUR}
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {interactable && (
        // c) The hit target. `onPointerOver` composes around `bind`'s own
        // handler rather than replacing it, adding `stopPropagation` so this
        // book's hit box — being nearer the camera in a close-up — claims the
        // shared highlight slot before the ray reaches the farther book
        // behind it. R3F sorts intersections near-to-far, so stopping
        // propagation here is what makes proximity decide the winner. This
        // is unrelated to `usePointerSelect`'s own note about skipping
        // `stopPropagation` on `onPointerDown`, which is about not
        // swallowing camera drags — hovering does not drag.
        <mesh
          position={[hitCentre.x, hitCentre.y, hitCentre.z]}
          name={title}
          {...bind}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            bind.onPointerOver()
          }}
        >
          <boxGeometry args={[hitSize.x, hitSize.y, hitSize.z]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

/** The gilt-lettered spines on the shelf. A sibling of `FocusTargets`
 *  inside `boatFrame`, not a new exhibit — they all already sit inside the
 *  `books` close-up that `FocusTargets`' box proxy flies the camera into;
 *  this component only owns what the books do once you are already there. */
export function BookSpines() {
  const focus = useSceneStore((s) => s.focus)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const openExhibit = useSceneStore((s) => s.openExhibit)
  const showComingSoon = useComingSoonStore((s) => s.show)
  // A book stops being clickable the moment an exhibit is open — otherwise a
  // click meant for the exhibit's own controls could land on the shelf
  // behind it, and a second click on the same book would try to reopen what
  // is already open.
  const interactable = focus === 'books' && !isTransitioning && activeExhibitId === null

  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // The hit meshes unmount the moment the camera leaves (they only render
  // while `interactable`), so they never get to fire their own
  // `pointerout`/deselect — without this a book would stay lit after the
  // close-up is gone.
  useEffect(() => {
    if (!interactable) {
      setHighlighted(null)
      setSelected(null)
    }
  }, [interactable])

  return (
    <>
      {BOOKS.map((book) => (
        <BookSpine
          key={book.node}
          {...book}
          interactable={interactable}
          highlighted={highlighted === book.node}
          selected={selected === book.node}
          exhibitOpen={book.exhibit !== undefined && activeExhibitId === book.exhibit}
          setHighlighted={setHighlighted}
          onSelect={(node) => {
            // A book wired to an exhibit opens it directly, one wired to a
            // URL opens that in a new tab. The rest keep the sticky-glow
            // placeholder — a seam for whatever selecting them ends up
            // doing, not the finished behaviour: selecting a lit book again
            // clears the selection, selecting the other moves it, exclusive
            // the same way the highlight is.
            if (book.exhibit) {
              openExhibit(book.exhibit)
              return
            }
            if (book.url) {
              window.open(book.url, '_blank', 'noopener,noreferrer')
              return
            }
            // Neither an exhibit nor a URL: this is a placeholder spine (e.g.
            // "About Me"), so the sticky-glow toggle still runs but is now
            // paired with the same "coming soon" toast the placeholder camera
            // focuses use — driven off the absence of `exhibit`/`url` rather
            // than the book's own name, so a future placeholder book needs no
            // change here.
            showComingSoon('Coming soon')
            setSelected((current) => (current === node ? null : node))
          }}
        />
      ))}
    </>
  )
}

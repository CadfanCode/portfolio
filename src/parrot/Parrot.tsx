import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MathUtils, Mesh, Quaternion, Vector3 } from 'three'
import type { Group } from 'three'
import { prefersReducedMotion } from '../scene/introFlight'
import { useSceneStore } from '../state/useSceneStore'
import { usePointerSelect } from '../scene/usePointerSelect'
import { useParrotStore } from './useParrotStore'
import { PARROT_POSITION, PARROT_REST_YAW, PARROT_SCALE } from './geometry'
import { buildParrotSkin } from './parrotRig'
import modelUrl from '../assets/models/parrot.glb?url'

const deg = (d: number) => (d * Math.PI) / 180

// --- Head tracking -----------------------------------------------------

/** How far off dead-ahead, in radians, the head is allowed to turn before it
 *  runs out of neck — past this the whole body would have to turn instead,
 *  which this rig doesn't animate, so the target simply clamps here. */
const HEAD_YAW_RANGE = deg(65)
const HEAD_PITCH_RANGE = deg(22)

/** Below this much change in the camera-tracking target, the head doesn't
 *  bother re-aiming. Without it a stationary viewer's tiny free-look drift
 *  would keep nudging the head by fractions of a degree forever, which reads
 *  as a nervous tic rather than an animal holding your eye. */
const HEAD_DEAD_ZONE = deg(3.5)

const HEAD_DAMP_LAMBDA = 6

/** Roughly how often, in seconds, Polly glances away and back — a bird
 *  that never breaks eye contact reads as a camera, not a pet. */
const SACCADE_MIN_INTERVAL = 3
const SACCADE_MAX_INTERVAL = 7.5
const SACCADE_HOLD = 0.35
const SACCADE_MAX_OFFSET = deg(14)

/** How often, in seconds, a wing-flap fires, and how long one takes — a
 *  single quick beat, not a flutter, since he isn't going anywhere. */
const FLAP_MIN_INTERVAL = 6
const FLAP_MAX_INTERVAL = 14
const FLAP_DURATION = 0.4
/** On this model the folded wings are the flank panels, so a full flap
 *  isn't available the way it was on the procedural bird — this reads as a
 *  wing shuffle, not a beat. Verified by rendering the posed mesh: at
 *  16-18 deg the wings lift clearly off the flank even at ~140 px on
 *  screen; by 26 deg they start splaying outward at the bottom, and by
 *  40 deg the bird looks bow-legged with its wings dragging. */
const FLAP_MAX_ANGLE = deg(18)

/** Idle body bob and tail sway — a couple of millimetres and a few degrees,
 *  there to keep him from reading as a static prop, not to draw the eye. */
const BOB_AMPLITUDE = 0.0035
const BOB_ANGULAR_SPEED = (2 * Math.PI) / 2.6
const TAIL_SWAY_AMPLITUDE = deg(5)
const TAIL_SWAY_ANGULAR_SPEED = (2 * Math.PI) / 3.4

// --- Hover affordance ----------------------------------------------------
//
// The click target is the whole bird. The GLB has no material variant that
// would read as "clickable" either, so the affordance is a small piece of
// body language instead: a head perk, the kind of thing a bird actually does
// when it notices you looking at it. Damps toward a 0/1 target rather than
// snapping, same idiom as the head tracking above. No vertical lift on top
// of it — see `HOVER_PERK`'s own call sites for why that was dropped.
const HOVER_PERK = deg(9)
const HOVER_DAMP_LAMBDA = 9

/**
 * Polly, the ship's parrot: a real GLB (see `parrot.glb`, attribution in
 * `ATTRIBUTION.md`), rigged at load time by `parrotRig.ts` since the asset
 * ships with no skeleton of its own. `buildParrotSkin` hands back a
 * `SkinnedMesh` and its five bones; everything below drives those bones the
 * same way the old procedural rig drove plain `Group`s, so the animation —
 * head tracking, dead zone, saccades, flap timer, bob, tail sway, the hover
 * affordance — carries over untouched.
 *
 * All animation here is imperative, inside `useFrame`, on refs — never
 * `setState` — for the same reason `BookSpines.tsx` does it that way: this
 * runs every frame, and routing it through React state would mean a render
 * every frame too.
 */
export function Parrot() {
  const camera = useThree((s) => s.camera)
  const { scene } = useGLTF(modelUrl)

  const skin = useMemo(() => {
    let sourceMesh: Mesh | null = null
    scene.traverse((o) => {
      if (!sourceMesh && o instanceof Mesh) sourceMesh = o
    })
    if (!sourceMesh) throw new Error('parrot.glb: no mesh found')
    return buildParrotSkin(sourceMesh)
  }, [scene])

  // The recoloured plumage texture is owned by this skin, not the `useGLTF`
  // cache (see `parrotRig.ts`), so it has to be disposed here rather than
  // left for three.js's cache-wide disposal to catch.
  useEffect(() => {
    return () => skin.plumageTexture?.dispose()
  }, [skin])

  // The click affordance only makes sense while there's somewhere for the
  // click to lead: not mid-camera-move (the panel opening under a still-
  // moving camera would be disorienting) and not with an exhibit already
  // open (which already owns the visitor's attention and its own back
  // button — a second overlapping panel would fight it).
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const sceneState = useSceneStore((s) => s.scene)
  const openChat = useParrotStore((s) => s.openChat)
  // Set here, consumed in `useFrame` where `clock.elapsedTime` is available —
  // same idiom the saccade and flap timers already use, driving off clock
  // time rather than a countdown so a frame drop can't double-fire it. A
  // plain ref rather than `setState` for the same reason the rest of this
  // component's animation is imperative: this doesn't need a render.
  const flapRequested = useRef(false)
  const { hovered, bind } = usePointerSelect({
    enabled: !isTransitioning && activeExhibitId === null,
    onSelect: () => {
      openChat(sceneState)
      flapRequested.current = true
    },
  })

  const root = useRef<Group>(null)
  const bodyBob = useRef<Group>(null)

  // Current and target angles for the head, damped toward the target rather
  // than snapped to it. `trackedYaw`/`trackedPitch` are the dead-zoned camera
  // target; `offsetYaw`/`offsetPitch` are the saccade's temporary addition to
  // it. Kept as plain refs, not a Vector3, since yaw and pitch damp on
  // independent lambdas-of-one, not as a pair.
  const yaw = useRef(0)
  const pitch = useRef(0)
  const trackedYaw = useRef(0)
  const trackedPitch = useRef(0)
  const saccadeOffsetYaw = useRef(0)
  const saccadeOffsetPitch = useRef(0)
  const nextSaccadeAt = useRef(SACCADE_MIN_INTERVAL)
  const saccadeUntil = useRef(0)
  const nextFlapAt = useRef(FLAP_MIN_INTERVAL)
  const flapStart = useRef(-Infinity)
  // Damped 0..1 toward the current hover state — see the hover affordance
  // constants above.
  const hoverAmount = useRef(0)

  // Scratch objects, allocated once and mutated every frame rather than
  // reallocated in the loop (see `IntroTitle.tsx`'s `titlePosition` for the
  // same reasoning applied to a constant instead of a per-frame scratch).
  const worldPos = useRef(new Vector3())
  const worldQuat = useRef(new Quaternion())
  const toCamera = useRef(new Vector3())

  useFrame(({ clock }, delta) => {
    const rootObj = root.current
    if (!rootObj) return

    const { head, wingL, wingR, tail } = skin.bones

    const reduced = prefersReducedMotion()
    const t = clock.elapsedTime

    // Camera direction expressed in the bird's own local frame: world-space
    // position and orientation come off the group itself (so this still
    // works if the boat frame is ever mid-rock rather than the identity —
    // see `cameraStops.ts:60-64` on when it is and isn't), then the camera
    // offset is rotated back into that frame by the inverse of the same
    // quaternion.
    rootObj.getWorldPosition(worldPos.current)
    rootObj.getWorldQuaternion(worldQuat.current)
    toCamera.current.subVectors(camera.position, worldPos.current)
    toCamera.current.applyQuaternion(worldQuat.current.invert())

    const desiredYaw = MathUtils.clamp(
      Math.atan2(toCamera.current.x, toCamera.current.z),
      -HEAD_YAW_RANGE,
      HEAD_YAW_RANGE,
    )
    const horizontal = Math.hypot(toCamera.current.x, toCamera.current.z)
    const desiredPitch = MathUtils.clamp(
      Math.atan2(toCamera.current.y, horizontal),
      -HEAD_PITCH_RANGE,
      HEAD_PITCH_RANGE,
    )

    if (reduced) {
      // No damping, no saccade, no idle motion — just point at the camera
      // and hold. Oscillating limbs are the seizure-trigger concern here,
      // not a head that quietly tracks. The hover perk still snaps rather
      // than damping, for the same reason, but it isn't skipped outright —
      // a hover state that gave no feedback at all under reduced motion
      // would leave the click target undiscoverable.
      hoverAmount.current = hovered ? 1 : 0
      trackedYaw.current = desiredYaw
      trackedPitch.current = desiredPitch
      yaw.current = desiredYaw
      pitch.current = desiredPitch
      head.rotation.y = yaw.current
      head.rotation.x = -pitch.current - hoverAmount.current * HOVER_PERK
      // Park the oscillating bones rather than just stopping driving them.
      // `prefersReducedMotion()` is re-read every frame, so it can go true
      // mid-flap — without this the wings would freeze half-open and stay
      // that way for the life of the tab.
      wingL.rotation.z = 0
      wingR.rotation.z = 0
      tail.rotation.y = 0
      // Same seizure-trigger reasoning as the parked wings above: a click
      // flap is oscillating limb motion too, so it's dropped rather than
      // played, and the request is cleared so it can't fire late once
      // reduced motion turns back off.
      flapRequested.current = false
      return
    }

    if (Math.abs(desiredYaw - trackedYaw.current) > HEAD_DEAD_ZONE) {
      trackedYaw.current = desiredYaw
    }
    if (Math.abs(desiredPitch - trackedPitch.current) > HEAD_DEAD_ZONE) {
      trackedPitch.current = desiredPitch
    }

    // The saccade: a brief snap to a random nearby offset, then back. Firing
    // it off a clock-time threshold rather than a countdown-to-zero timer
    // means a frame drop can't cause two to fire in the same tick.
    if (t >= nextSaccadeAt.current) {
      saccadeOffsetYaw.current = MathUtils.randFloatSpread(2 * SACCADE_MAX_OFFSET)
      saccadeOffsetPitch.current = MathUtils.randFloatSpread(2 * SACCADE_MAX_OFFSET) * 0.5
      saccadeUntil.current = t + SACCADE_HOLD
      nextSaccadeAt.current =
        t + SACCADE_HOLD + MathUtils.randFloat(SACCADE_MIN_INTERVAL, SACCADE_MAX_INTERVAL)
    }
    const inSaccade = t < saccadeUntil.current
    const targetYaw = MathUtils.clamp(
      trackedYaw.current + (inSaccade ? saccadeOffsetYaw.current : 0),
      -HEAD_YAW_RANGE,
      HEAD_YAW_RANGE,
    )
    const targetPitch = MathUtils.clamp(
      trackedPitch.current + (inSaccade ? saccadeOffsetPitch.current : 0),
      -HEAD_PITCH_RANGE,
      HEAD_PITCH_RANGE,
    )

    yaw.current = MathUtils.damp(yaw.current, targetYaw, HEAD_DAMP_LAMBDA, delta)
    pitch.current = MathUtils.damp(pitch.current, targetPitch, HEAD_DAMP_LAMBDA, delta)
    hoverAmount.current = MathUtils.damp(
      hoverAmount.current,
      hovered ? 1 : 0,
      HOVER_DAMP_LAMBDA,
      delta,
    )
    head.rotation.y = yaw.current
    head.rotation.x = -pitch.current - hoverAmount.current * HOVER_PERK

    // Wing flap: a one-shot eased pulse rather than a damped target, since
    // there's nothing to hold once it's done — a sine half-cycle over
    // `FLAP_DURATION`, symmetric on both wings. A click flap takes the same
    // path as the ambient one rather than a separate pulse, so there's only
    // ever one flap animation to reason about; it also pushes `nextFlapAt`
    // out by a fresh interval so the ambient timer doesn't double up on it.
    if (flapRequested.current) {
      flapRequested.current = false
      flapStart.current = t
      nextFlapAt.current = t + MathUtils.randFloat(FLAP_MIN_INTERVAL, FLAP_MAX_INTERVAL)
    } else if (t >= nextFlapAt.current) {
      flapStart.current = t
      nextFlapAt.current = t + MathUtils.randFloat(FLAP_MIN_INTERVAL, FLAP_MAX_INTERVAL)
    }
    const flapT = t - flapStart.current
    const flapAngle =
      flapT >= 0 && flapT <= FLAP_DURATION
        ? Math.sin((flapT / FLAP_DURATION) * Math.PI) * FLAP_MAX_ANGLE
        : 0
    wingL.rotation.z = flapAngle
    wingR.rotation.z = -flapAngle

    if (bodyBob.current) {
      bodyBob.current.position.y = Math.sin(t * BOB_ANGULAR_SPEED) * BOB_AMPLITUDE
    }
    tail.rotation.y = Math.sin(t * TAIL_SWAY_ANGULAR_SPEED) * TAIL_SWAY_AMPLITUDE
  })

  return (
    // `bind` spread on the root: R3F events bubble up from every primitive
    // drawn inside, so the whole bird is the click target without each mesh
    // needing its own handler. Deliberately no stopPropagation inside
    // `usePointerSelect` — see its own doc — so a drag that starts on
    // Polly still rotates the camera underneath him.
    <group
      ref={root}
      position={PARROT_POSITION}
      rotation={[0, PARROT_REST_YAW, 0]}
      {...bind}
    >
      {/* `bodyBob` stays a group in world units, outside the scaled group
          below, so `BOB_AMPLITUDE` keeps its existing metre value regardless
          of `PARROT_SCALE`. */}
      <group ref={bodyBob}>
        <group scale={PARROT_SCALE}>
          <primitive object={skin.skinned} />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload(modelUrl)

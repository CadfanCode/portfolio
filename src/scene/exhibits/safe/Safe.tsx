import { Edges, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import modelUrl from '../../../assets/models/maxi77.glb?url'
import { prefersReducedMotion } from '../../introFlight'
import { usePointerSelect } from '../../usePointerSelect'
import type { ExhibitSceneProps } from '../types'
import {
  ARRIVAL_ANGLE_EPS,
  ARRIVAL_POS_EPS,
  ARRIVAL_SCALE_EPS,
  BOAT_LATERAL_OFFSET,
  BOAT_PRESENT_SCALE,
  BOAT_VERTICAL_OFFSET,
  CARD_TIME_CONSTANT,
  CONTENTS_DISTANCE,
  CONTENTS_SPIN_SPEED,
  CONTENTS_TIME_CONSTANT,
  DOOR_SHAKE_AMPLITUDE,
  DOOR_SHAKE_DURATION,
  DOOR_SHAKE_FREQUENCY,
  DOOR_TIME_CONSTANT,
  HINGE_AXIS,
  HOLD_DISTANCE,
  HOVER_LIFT,
  HOVER_OPACITY,
  HOVER_TIME_CONSTANT,
  IDENTITY_QUAT,
  KEY_LATERAL_OFFSET,
  KEY_PRESENT_SCALE,
  KEY_VERTICAL_OFFSET,
  OPEN_ANGLE,
  PRESENT_SPIN_AXIS,
  SLOT_QUAT,
  VERIFY_PULSE_AMPLITUDE,
  VERIFY_PULSE_FREQUENCY,
  computeFacingPose,
  resolveCardTarget,
  type HoldPose,
} from './safeGeometry'
import type { SafePhase } from './useSafe'
import { useSafe } from './useSafe'
import { useSafeParts } from './useSafeParts'

/**
 * The 3D half of the safe exhibit: the desk safe's door, its brass escutcheon,
 * its contents, and the two keycards on the chart table, staged as physical
 * objects that hinge, lift and tap the way `useSafe`'s phase says they should.
 *
 * `useSafe` owns the story — this component only ever reads it and, once, the
 * `tapLanded` handshake writes back to say an animation has actually arrived.
 * Everything else here is pose: where the door, the cards and the contents
 * are this frame, worked out from the phase the same way `AboutBook.tsx`
 * works its `progress` — a scripted clock, not a physics sim.
 *
 * The technique for taking over a shared GLB object without leaving a mark on
 * it, borrowed wholesale from `AboutBook.tsx`: find the real node, hide it for
 * as long as this component is mounted, and render an animatable clone that
 * starts at exactly the same baked pose so the takeover is invisible. The
 * clones and the hide/restore, and everything measured off their boxes, live
 * in `useSafeParts` — this component only reads the results. The lookups fail
 * soft rather than assuming the node is present, because the Blender rebuild
 * that adds `desk_safe_door`, `desk_safe_contents`, `card_blue` and `card_red`
 * may not have landed yet.
 */

export function Safe({ active, onExited }: ExhibitSceneProps) {
  const { scene: model } = useGLTF(modelUrl)

  const phase = useSafe((s) => s.phase)
  const cardId = useSafe((s) => s.cardId)
  const tapLanded = useSafe((s) => s.tapLanded)
  // What the access token's scopes actually unlocked. The safe's two objects
  // are gated on this separately, so the reveal is the authorisation decision
  // made visible rather than a door opening on a fixed tableau.
  const grantedItems = useSafe((s) => s.result?.items)

  const {
    doorClone,
    brassClone,
    boatClone,
    keyClone,
    cardBlueClone,
    cardRedClone,
    hinge,
    cardBlueAnchor,
    cardRedAnchor,
    boatAnchor,
    keyAnchor,
    slotPos,
  } = useSafeParts(model)

  // Pointer selection for the two cards. Two direct calls, not a loop over a
  // list — usePointerSelect is a hook and can't be called conditionally or
  // inside one, and there are exactly two cards by design, not an open-ended
  // set.
  const blueSelect = usePointerSelect({
    enabled: active && phase === 'idle' && cardBlueClone !== null,
    onSelect: () => useSafe.getState().pickUp('card-blue'),
  })
  const redSelect = usePointerSelect({
    enabled: active && phase === 'idle' && cardRedClone !== null,
    onSelect: () => useSafe.getState().pickUp('card-red'),
  })

  const rootRef = useRef<Group>(null)
  const doorHingeRef = useRef<Group>(null)
  const cardBlueGroupRef = useRef<Group>(null)
  const cardRedGroupRef = useRef<Group>(null)
  const boatGroupRef = useRef<Group>(null)
  const keyGroupRef = useRef<Group>(null)

  const doorAngleRef = useRef(0)
  const shakeElapsedRef = useRef(Number.POSITIVE_INFINITY)
  const prevPhaseRef = useRef<SafePhase>('idle')

  // Lazily seeded to each card's own resting pose rather than to the origin,
  // so the very first frame doesn't chase in from (0,0,0) — a pop the
  // opposite of the invisible takeover the hide/clone trick above is for.
  // Mutating a ref directly in the render body like this (rather than in an
  // effect) is safe here because it's idempotent and the anchors are already
  // known synchronously: `useGLTF`'s cache is warm by the time this exhibit
  // can even open, since `Boat.tsx` has long since loaded the same model.
  const cardBluePosRef = useRef<Vector3 | null>(null)
  if (cardBluePosRef.current === null) {
    cardBluePosRef.current = cardBlueAnchor ? cardBlueAnchor.clone() : new Vector3()
  }
  const cardBlueQuatRef = useRef(new Quaternion())
  const cardRedPosRef = useRef<Vector3 | null>(null)
  if (cardRedPosRef.current === null) {
    cardRedPosRef.current = cardRedAnchor ? cardRedAnchor.clone() : new Vector3()
  }
  const cardRedQuatRef = useRef(new Quaternion())

  // Same lazy-seed-to-resting-pose idiom as the cards above, plus a scale
  // and a spin angle the cards don't need: the contents also grow as they
  // clear the cavity and turn slowly once presented.
  const boatPosRef = useRef<Vector3 | null>(null)
  if (boatPosRef.current === null) {
    boatPosRef.current = boatAnchor ? boatAnchor.clone() : new Vector3()
  }
  const boatQuatRef = useRef(new Quaternion())
  const boatFinalQuatRef = useRef(new Quaternion())
  const boatScaleRef = useRef(1)
  const boatSpinRef = useRef(0)
  const keyPosRef = useRef<Vector3 | null>(null)
  if (keyPosRef.current === null) {
    keyPosRef.current = keyAnchor ? keyAnchor.clone() : new Vector3()
  }
  const keyQuatRef = useRef(new Quaternion())
  const keyFinalQuatRef = useRef(new Quaternion())
  const keyScaleRef = useRef(1)
  const keySpinRef = useRef(0)

  /** Captured once per entry into `open` — see `holdPoseRef`'s own doc for
   *  why a pose captured once and held beats one chased every frame from a
   *  moving camera. Two of these, not one: the boat and the key present at
   *  different offsets from the same camera-relative point. */
  const boatPresentPoseRef = useRef<HoldPose | null>(null)
  const keyPresentPoseRef = useRef<HoldPose | null>(null)

  const blueHoverBlendRef = useRef(0)
  const redHoverBlendRef = useRef(0)
  const blueTappedRef = useRef(false)
  const redTappedRef = useRef(false)

  /** Captured once per entry into `holding` — see `AboutBook`'s
   *  `presentationPose` for the same reasoning: a pose chased continuously
   *  from a moving camera reads as the card stalking the visitor, a pose
   *  captured once and then held reads as the visitor having picked it up. */
  const holdPoseRef = useRef<HoldPose | null>(null)

  const wasActiveRef = useRef(false)
  const exitedRef = useRef(false)

  // Scratch objects, allocated once outside the frame loop and mutated every
  // frame — see the project's rule on vectors in `useFrame`.
  const scratchPos = useRef(new Vector3()).current
  const scratchQuat = useRef(new Quaternion()).current
  const tmpCamPos = useRef(new Vector3()).current
  const tmpCamQuat = useRef(new Quaternion()).current
  const tmpForward = useRef(new Vector3()).current
  const tmpNormal = useRef(new Vector3()).current
  const tmpUp = useRef(new Vector3()).current
  const tmpRight = useRef(new Vector3()).current
  const tmpAxisZ = useRef(new Vector3()).current
  const tmpBasis = useRef(new Matrix4()).current
  const tmpParentQuat = useRef(new Quaternion()).current
  const tmpParentQuatInv = useRef(new Quaternion()).current
  const tmpParentMatInv = useRef(new Matrix4()).current
  // The slot, carried round by the door's own swing (see below).
  const tmpSlotPos = useRef(new Vector3()).current
  const tmpDoorQuat = useRef(new Quaternion()).current
  const tmpSlotQuat = useRef(new Quaternion()).current
  // The contents' idle spin, applied on top of their chased orientation.
  const tmpSpinQuat = useRef(new Quaternion()).current

  useFrame((state, delta) => {
    if (active && !wasActiveRef.current) exitedRef.current = false
    wasActiveRef.current = active

    const reduced = prefersReducedMotion()
    const angleK = reduced ? 1 : 1 - Math.exp(-delta / DOOR_TIME_CONSTANT)
    const cardK = reduced ? 1 : 1 - Math.exp(-delta / CARD_TIME_CONSTANT)
    const hoverK = reduced ? 1 : 1 - Math.exp(-delta / HOVER_TIME_CONSTANT)

    // Capture the "holding" pose exactly once on entry: a point out in front
    // of wherever the camera actually is right now, oriented so the card's
    // face (local +Y — see `SLOT_QUAT`'s doc on that assumption) points back
    // at it. Built as an explicit basis rather than a lookAt matrix, the same
    // choice `AboutBook` makes and for the same reason: lookAt assumes −Z is
    // forward, and this object's forward-equivalent axis is +Y.
    if (active && phase === 'holding' && prevPhaseRef.current !== 'holding') {
      const camera = state.camera as PerspectiveCamera
      camera.getWorldPosition(tmpCamPos)
      camera.getWorldQuaternion(tmpCamQuat)
      tmpForward.set(0, 0, -1).applyQuaternion(tmpCamQuat)
      tmpNormal.copy(tmpForward).negate()
      tmpUp.set(0, 1, 0).applyQuaternion(tmpCamQuat)
      tmpRight.crossVectors(tmpUp, tmpNormal).normalize()
      // The remaining axis is built as X × Y rather than reusing `tmpUp`
      // directly, so the three columns are guaranteed orthonormal and
      // right-handed regardless of which way the camera happens to be tilted.
      tmpAxisZ.crossVectors(tmpRight, tmpNormal).normalize()
      tmpBasis.makeBasis(tmpRight, tmpNormal, tmpAxisZ)
      scratchQuat.setFromRotationMatrix(tmpBasis)
      scratchPos.copy(tmpCamPos).addScaledVector(tmpForward, HOLD_DISTANCE)

      // Convert from world space into this group's parent space (the rocking
      // boat frame), the same conversion `AboutBook` does for its own
      // presentation pose.
      const parent = rootRef.current?.parent
      if (parent) {
        parent.updateWorldMatrix(true, false)
        parent.getWorldQuaternion(tmpParentQuat)
        tmpParentQuatInv.copy(tmpParentQuat).invert()
        tmpParentMatInv.copy(parent.matrixWorld).invert()
        scratchPos.applyMatrix4(tmpParentMatInv)
        scratchQuat.premultiply(tmpParentQuatInv)
      }
      holdPoseRef.current = { position: scratchPos.clone(), quaternion: scratchQuat.clone() }
    }

    // Capture the contents' presented poses exactly once on entry into
    // `open`, the same "once, not chased" idiom as the holding capture just
    // above. Captured unconditionally on the phase transition rather than
    // gated on which items were granted — cheap, and it keeps this block
    // symmetric with the one above rather than adding a second branch.
    if (active && phase === 'open' && prevPhaseRef.current !== 'open') {
      const camera = state.camera as PerspectiveCamera
      camera.getWorldPosition(tmpCamPos)
      camera.getWorldQuaternion(tmpCamQuat)
      const parent = rootRef.current?.parent

      computeFacingPose(
        tmpCamPos,
        tmpCamQuat,
        CONTENTS_DISTANCE,
        BOAT_LATERAL_OFFSET,
        BOAT_VERTICAL_OFFSET,
        tmpForward,
        tmpNormal,
        tmpUp,
        tmpRight,
        tmpAxisZ,
        tmpBasis,
        scratchPos,
        scratchQuat,
      )
      if (parent) {
        parent.updateWorldMatrix(true, false)
        parent.getWorldQuaternion(tmpParentQuat)
        tmpParentQuatInv.copy(tmpParentQuat).invert()
        tmpParentMatInv.copy(parent.matrixWorld).invert()
        scratchPos.applyMatrix4(tmpParentMatInv)
        scratchQuat.premultiply(tmpParentQuatInv)
      }
      boatPresentPoseRef.current = { position: scratchPos.clone(), quaternion: scratchQuat.clone() }

      computeFacingPose(
        tmpCamPos,
        tmpCamQuat,
        CONTENTS_DISTANCE,
        KEY_LATERAL_OFFSET,
        KEY_VERTICAL_OFFSET,
        tmpForward,
        tmpNormal,
        tmpUp,
        tmpRight,
        tmpAxisZ,
        tmpBasis,
        scratchPos,
        scratchQuat,
      )
      if (parent) {
        // `parent`'s world matrix was already refreshed above this frame;
        // the inverses are still valid for this second conversion.
        scratchPos.applyMatrix4(tmpParentMatInv)
        scratchQuat.premultiply(tmpParentQuatInv)
      }
      keyPresentPoseRef.current = { position: scratchPos.clone(), quaternion: scratchQuat.clone() }
    }

    // --- the door -----------------------------------------------------
    const doorTarget = active && phase === 'open' ? OPEN_ANGLE : 0
    doorAngleRef.current = MathUtils.lerp(doorAngleRef.current, doorTarget, angleK)

    if (active && phase === 'denied' && prevPhaseRef.current !== 'denied') {
      shakeElapsedRef.current = 0
    }
    let shakeOffset = 0
    if (shakeElapsedRef.current < DOOR_SHAKE_DURATION) {
      shakeElapsedRef.current += delta
      const envelope = 1 - shakeElapsedRef.current / DOOR_SHAKE_DURATION
      shakeOffset =
        DOOR_SHAKE_AMPLITUDE * envelope * Math.sin(shakeElapsedRef.current * DOOR_SHAKE_FREQUENCY)
    }
    if (doorHingeRef.current) doorHingeRef.current.rotation.y = doorAngleRef.current + shakeOffset

    // Only shown once the door has swung more than halfway — a cheap way to
    // read as "revealed by the door" rather than "always there, briefly
    // visible through the gap". Each object is then gated on the item that
    // unlocked it, so a blue card really does open a safe with no key in it
    // rather than one whose key has merely been hidden by the front end.
    // Compared as magnitudes. `OPEN_ANGLE` is negative now, and `a > b * 0.5`
    // is false for every angle on the way to a negative target — written that
    // way the contents would never appear at all.
    const doorIsOpenEnough =
      active &&
      phase === 'open' &&
      Math.abs(doorAngleRef.current) > Math.abs(OPEN_ANGLE) * 0.5
    // Visible for the whole time an item isn't at rest in the cavity, not
    // just while the door itself is mid-swing: `doorIsOpenEnough` above goes
    // false the instant the exhibit starts closing (it depends on `active`),
    // but the contents still have most of their return trip left to animate
    // at that point, and hiding them there would cut the "ease back into the
    // cavity" motion off before it's visibly finished. Reading last frame's
    // position for this is a one-frame-stale check at worst, which an
    // arrival epsilon already tolerates.
    const boatAtHome = !boatAnchor || boatPosRef.current!.distanceTo(boatAnchor) < ARRIVAL_POS_EPS
    const keyAtHome = !keyAnchor || keyPosRef.current!.distanceTo(keyAnchor) < ARRIVAL_POS_EPS
    if (boatClone) {
      boatClone.visible =
        (doorIsOpenEnough || !boatAtHome) && (grantedItems?.includes('boat') ?? false)
    }
    if (keyClone) {
      keyClone.visible =
        (doorIsOpenEnough || !keyAtHome) && (grantedItems?.includes('key') ?? false)
    }

    // Where the slot is *now*. A card seated in the door is part of the door,
    // so when the door swings the card has to go round with it — left at the
    // slot's shut-door position it would hang in mid-air where the door used
    // to be. Rotating the point about the hinge is the whole fix, and it
    // avoids reparenting a live object mid-animation to get the same result.
    let slotNow: Vector3 | null = slotPos
    let slotQuatNow: Quaternion = SLOT_QUAT
    if (slotPos && hinge) {
      tmpDoorQuat.setFromAxisAngle(HINGE_AXIS, doorAngleRef.current)
      slotNow = tmpSlotPos.copy(slotPos).sub(hinge).applyQuaternion(tmpDoorQuat).add(hinge)
      slotQuatNow = tmpSlotQuat.copy(tmpDoorQuat).multiply(SLOT_QUAT)
    }

    // --- the cards ------------------------------------------------------
    if (cardBlueAnchor && cardBluePosRef.current) {
      blueHoverBlendRef.current = MathUtils.lerp(
        blueHoverBlendRef.current,
        blueSelect.hovered ? 1 : 0,
        hoverK,
      )
      resolveCardTarget(
        active,
        phase,
        cardId === 'card-blue',
        cardBlueAnchor,
        holdPoseRef.current,
        slotNow,
        slotQuatNow,
        scratchPos,
        scratchQuat,
      )
      if (active && phase === 'verifying' && cardId === 'card-blue') {
        scratchPos.x += VERIFY_PULSE_AMPLITUDE * Math.sin(state.clock.elapsedTime * VERIFY_PULSE_FREQUENCY)
      }
      scratchPos.y += blueHoverBlendRef.current * HOVER_LIFT
      cardBluePosRef.current.lerp(scratchPos, cardK)
      cardBlueQuatRef.current.slerp(scratchQuat, cardK)
      if (cardBlueGroupRef.current) {
        cardBlueGroupRef.current.position.copy(cardBluePosRef.current)
        cardBlueGroupRef.current.quaternion.copy(cardBlueQuatRef.current)
      }
      if (active && phase === 'tapping' && cardId === 'card-blue' && slotNow) {
        const dist = cardBluePosRef.current.distanceTo(slotNow)
        const angleDiff = cardBlueQuatRef.current.angleTo(slotQuatNow)
        if (dist < ARRIVAL_POS_EPS && angleDiff < ARRIVAL_ANGLE_EPS && !blueTappedRef.current) {
          blueTappedRef.current = true
          tapLanded()
        }
      } else {
        blueTappedRef.current = false
      }
    }

    if (cardRedAnchor && cardRedPosRef.current) {
      redHoverBlendRef.current = MathUtils.lerp(
        redHoverBlendRef.current,
        redSelect.hovered ? 1 : 0,
        hoverK,
      )
      resolveCardTarget(
        active,
        phase,
        cardId === 'card-red',
        cardRedAnchor,
        holdPoseRef.current,
        slotNow,
        slotQuatNow,
        scratchPos,
        scratchQuat,
      )
      if (active && phase === 'verifying' && cardId === 'card-red') {
        scratchPos.x += VERIFY_PULSE_AMPLITUDE * Math.sin(state.clock.elapsedTime * VERIFY_PULSE_FREQUENCY)
      }
      scratchPos.y += redHoverBlendRef.current * HOVER_LIFT
      cardRedPosRef.current.lerp(scratchPos, cardK)
      cardRedQuatRef.current.slerp(scratchQuat, cardK)
      if (cardRedGroupRef.current) {
        cardRedGroupRef.current.position.copy(cardRedPosRef.current)
        cardRedGroupRef.current.quaternion.copy(cardRedQuatRef.current)
      }
      if (active && phase === 'tapping' && cardId === 'card-red' && slotNow) {
        const dist = cardRedPosRef.current.distanceTo(slotNow)
        const angleDiff = cardRedQuatRef.current.angleTo(slotQuatNow)
        if (dist < ARRIVAL_POS_EPS && angleDiff < ARRIVAL_ANGLE_EPS && !redTappedRef.current) {
          redTappedRef.current = true
          tapLanded()
        }
      } else {
        redTappedRef.current = false
      }
    }

    // --- the contents ---------------------------------------------------
    // Slower than the cards' own chase — see `CONTENTS_TIME_CONSTANT`'s doc.
    const contentsK = reduced ? 1 : 1 - Math.exp(-delta / CONTENTS_TIME_CONSTANT)
    const boatGranted = grantedItems?.includes('boat') ?? false
    const keyGranted = grantedItems?.includes('key') ?? false
    const boatPresented = active && phase === 'open' && boatGranted
    const keyPresented = active && phase === 'open' && keyGranted

    if (boatAnchor && boatPosRef.current) {
      const pose = boatPresentPoseRef.current
      if (boatPresented && pose) {
        scratchPos.copy(pose.position)
        scratchQuat.copy(pose.quaternion)
      } else {
        scratchPos.copy(boatAnchor)
        scratchQuat.identity()
      }
      boatPosRef.current.lerp(scratchPos, contentsK)
      boatQuatRef.current.slerp(scratchQuat, contentsK)
      boatScaleRef.current = MathUtils.lerp(
        boatScaleRef.current,
        boatPresented ? BOAT_PRESENT_SCALE : 1,
        contentsK,
      )
      // The spin only accrues while presented, and not under reduced motion
      // — `contentsK` is 1 in that case, so the `else` branch snaps it
      // straight to zero instead. Otherwise chased back to zero the rest of
      // the time so the returning object's final orientation converges on
      // exactly identity rather than identity-plus-some-frozen-spin, which
      // is what the exit check below relies on. Wrapped to keep the angle
      // itself from growing without bound across a long, idle presentation.
      boatSpinRef.current =
        boatPresented && !reduced
          ? (boatSpinRef.current + delta * CONTENTS_SPIN_SPEED) % (Math.PI * 2)
          : MathUtils.lerp(boatSpinRef.current, 0, contentsK)
      tmpSpinQuat.setFromAxisAngle(PRESENT_SPIN_AXIS, boatSpinRef.current)
      boatFinalQuatRef.current.copy(boatQuatRef.current).premultiply(tmpSpinQuat)
      if (boatGroupRef.current) {
        boatGroupRef.current.position.copy(boatPosRef.current)
        boatGroupRef.current.quaternion.copy(boatFinalQuatRef.current)
        boatGroupRef.current.scale.setScalar(boatScaleRef.current)
      }
    }

    if (keyAnchor && keyPosRef.current) {
      const pose = keyPresentPoseRef.current
      if (keyPresented && pose) {
        scratchPos.copy(pose.position)
        scratchQuat.copy(pose.quaternion)
      } else {
        scratchPos.copy(keyAnchor)
        scratchQuat.identity()
      }
      keyPosRef.current.lerp(scratchPos, contentsK)
      keyQuatRef.current.slerp(scratchQuat, contentsK)
      keyScaleRef.current = MathUtils.lerp(
        keyScaleRef.current,
        keyPresented ? KEY_PRESENT_SCALE : 1,
        contentsK,
      )
      keySpinRef.current =
        keyPresented && !reduced
          ? (keySpinRef.current + delta * CONTENTS_SPIN_SPEED) % (Math.PI * 2)
          : MathUtils.lerp(keySpinRef.current, 0, contentsK)
      tmpSpinQuat.setFromAxisAngle(PRESENT_SPIN_AXIS, keySpinRef.current)
      keyFinalQuatRef.current.copy(keyQuatRef.current).premultiply(tmpSpinQuat)
      if (keyGroupRef.current) {
        keyGroupRef.current.position.copy(keyPosRef.current)
        keyGroupRef.current.quaternion.copy(keyFinalQuatRef.current)
        keyGroupRef.current.scale.setScalar(keyScaleRef.current)
      }
    }

    prevPhaseRef.current = phase

    // Once closed, `active` goes false but this component stays mounted
    // until everything has actually eased home — see `ExhibitSceneProps`'s
    // own doc on why. Checked against the *animated* state rather than the
    // phase, so a visitor who navigates away mid-swing still sees the door
    // finish closing before the cabin blanks it out.
    if (!active && !exitedRef.current) {
      const doorHome = Math.abs(doorAngleRef.current) < ARRIVAL_ANGLE_EPS
      const blueHome =
        !cardBlueAnchor ||
        (cardBluePosRef.current!.distanceTo(cardBlueAnchor) < ARRIVAL_POS_EPS &&
          cardBlueQuatRef.current.angleTo(IDENTITY_QUAT) < ARRIVAL_ANGLE_EPS)
      const redHome =
        !cardRedAnchor ||
        (cardRedPosRef.current!.distanceTo(cardRedAnchor) < ARRIVAL_POS_EPS &&
          cardRedQuatRef.current.angleTo(IDENTITY_QUAT) < ARRIVAL_ANGLE_EPS)
      const boatHome =
        !boatAnchor ||
        (boatPosRef.current!.distanceTo(boatAnchor) < ARRIVAL_POS_EPS &&
          boatFinalQuatRef.current.angleTo(IDENTITY_QUAT) < ARRIVAL_ANGLE_EPS &&
          Math.abs(boatScaleRef.current - 1) < ARRIVAL_SCALE_EPS)
      const keyHome =
        !keyAnchor ||
        (keyPosRef.current!.distanceTo(keyAnchor) < ARRIVAL_POS_EPS &&
          keyFinalQuatRef.current.angleTo(IDENTITY_QUAT) < ARRIVAL_ANGLE_EPS &&
          Math.abs(keyScaleRef.current - 1) < ARRIVAL_SCALE_EPS)
      if (doorHome && blueHome && redHome && boatHome && keyHome) {
        exitedRef.current = true
        // Clear the flow before the exhibit unmounts. `AboutBook` does the
        // same with its own store, and for the same reason: without it a
        // visitor who walks away from an open safe and comes back finds it
        // still open, still showing the tokens from last time, with no tap in
        // between. The reset belongs here rather than in `closeExhibit`
        // because only this component knows the door has finished shutting.
        useSafe.getState().reset()
        onExited()
      }
    }
  })

  return (
    <group ref={rootRef}>
      {hinge && (doorClone || brassClone) && (
        <group ref={doorHingeRef} position={[hinge.x, hinge.y, hinge.z]}>
          {doorClone && (
            <primitive object={doorClone} position={[-hinge.x, -hinge.y, -hinge.z]} />
          )}
          {/* The brass belongs to the door, not to the body: the handle, the
              dial, the index and the slot jaws are all screwed to the leaf, so
              they have to turn with it. Mounted outside this group they stayed
              welded to the safe while a bare panel swung away — which is what
              it looked like, a door with its ironmongery left behind. */}
          {brassClone && (
            <primitive object={brassClone} position={[-hinge.x, -hinge.y, -hinge.z]} />
          )}
        </group>
      )}
      {/* Wrapped in their own hinge-style group, the same pattern the door
          uses above: the group carries the animated world pose, the
          `primitive` inside sits offset by its own negated anchor so the
          mesh's baked geometry lines up with the group's origin. Without
          this the contents could only ever be rendered at their one baked
          pose, with nothing to move to present them. */}
      {boatClone && boatAnchor && (
        <group ref={boatGroupRef}>
          <primitive
            object={boatClone}
            position={[-boatAnchor.x, -boatAnchor.y, -boatAnchor.z]}
          />
        </group>
      )}
      {keyClone && keyAnchor && (
        <group ref={keyGroupRef}>
          <primitive object={keyClone} position={[-keyAnchor.x, -keyAnchor.y, -keyAnchor.z]} />
        </group>
      )}
      {cardBlueClone && cardBlueAnchor && (
        <group ref={cardBlueGroupRef} {...blueSelect.bind}>
          <primitive
            object={cardBlueClone}
            position={[-cardBlueAnchor.x, -cardBlueAnchor.y, -cardBlueAnchor.z]}
          >
            {/* The hover hint, same idiom as `FocusTargets`: an outline says
                "this region is clickable", not a glow on the object itself. */}
            <Edges visible={blueSelect.hovered} color="#ffffff" transparent opacity={HOVER_OPACITY} />
          </primitive>
        </group>
      )}
      {cardRedClone && cardRedAnchor && (
        <group ref={cardRedGroupRef} {...redSelect.bind}>
          <primitive
            object={cardRedClone}
            position={[-cardRedAnchor.x, -cardRedAnchor.y, -cardRedAnchor.z]}
          >
            <Edges visible={redSelect.hovered} color="#ffffff" transparent opacity={HOVER_OPACITY} />
          </primitive>
        </group>
      )}
    </group>
  )
}

// No `useGLTF.preload` here — `Boat.tsx` already preloads the same model, and
// this exhibit can only ever open once that model has rendered the cabin it
// lives in, so the cache is already warm by the time `Safe` mounts.

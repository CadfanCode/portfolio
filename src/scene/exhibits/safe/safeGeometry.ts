import { Box3, MathUtils, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { Mesh as MeshType } from 'three'
import type { SafePhase } from './useSafe'

/**
 * The pure, React-free geometry and pose layer for the safe exhibit: the
 * mesh-lookup and box-conversion helpers, the fixed geometry constants they
 * rely on, the animation timeline constants, and the target-resolution
 * helpers `Safe.tsx`'s `useFrame` calls every frame. Nothing here touches
 * React or holds state — every function takes its inputs and, where it
 * writes a result, the caller's own scratch objects, per this file's rule
 * against allocating inside `useFrame`.
 */

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function findMesh(root: Object3D, name: string): MeshType | null {
  let found: MeshType | null = null
  root.traverse((o) => {
    if (!found && o instanceof Mesh && o.name === name) found = o
  })
  return found
}

/**
 * A mesh's own geometry bounding box, converted from mesh-local into model
 * space. Every node in this GLB is baked with its vertices already in world
 * coordinates and a zero translation on the node itself (verified against the
 * built file), so this conversion is normally a no-op — it exists so the
 * numbers stay correct even where a node sits under an intermediate group
 * with a real transform, the same defensive step `AboutBook.tsx`'s
 * `readShelfSlot` takes.
 */
export function meshBoxInModelSpace(model: Object3D, mesh: MeshType): Box3 {
  model.updateMatrixWorld(true)
  mesh.updateWorldMatrix(true, false)
  const toModel = new Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld)
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox ?? new Box3()
  return box.clone().applyMatrix4(toModel)
}

// ---------------------------------------------------------------------------
// Fixed geometry constants
// ---------------------------------------------------------------------------

/** The door swings open toward the cabin — see the rotation-sign derivation
 *  by the hinge group below for why this is a *positive* Y rotation. */
/**
 * How far the door swings, and which way.
 *
 * Negative, because the hinge is on the after edge: rotating about +Y, a
 * negative angle carries the free forward edge inboard, into the cabin, which
 * is the way a door on that edge opens. Positive would drive it through the
 * safe's own body.
 *
 * Just past square. At 95° the leaf stands roughly perpendicular to the safe's
 * face, tucked at the after end where the camera — which is forward of the
 * safe — is not looking, leaving the opening clear. Swinging it further only
 * brings it back toward the bulkhead for no gain, and an earlier 150° version
 * put it down into the desk block, where it read as the door vanishing.
 */
export const OPEN_ANGLE = MathUtils.degToRad(-95)

/** How far proud of the brass plate's own outward face a seated card floats.
 *  There is no dedicated slot node to read this off yet, so it is a constant
 *  chosen to clear the brass without visibly hovering off it. */
export const SLOT_PROUD = 0.004
/** The hinge turns about world +Y: the door is a vertical leaf on a vertical
 *  edge, like every safe door. */
export const HINGE_AXIS = /*@__PURE__*/ new Vector3(0, 1, 0)

/**
 * Where the slot sits on the safe, restated from `_desk_safe_slot` in
 * `blender/fitout.py` — `top + height * 0.24` up, and `centre - 0.020` along
 * the station axis.
 *
 * Restated rather than measured, because the jaws are joined into
 * `desk_safe_brass` together with the handle, the dial and the index, and that
 * object's bounding box is the middle of all four rather than the slot. Aimed
 * at the box's centre, a card parks beside the dial — which is what it did.
 *
 * The station offset is negative because the whole dial/handle/slot cluster
 * was mirrored when the door was re-hung on the after edge: a handle belongs
 * at the free edge, which is now forward, and the rest moved with it. Stations
 * are measured aft and glTF z runs the same way, so forward of centre is
 * negative in both.
 *
 * These two have to be kept in step with that file by hand. There is no
 * dedicated slot node to read instead, and nothing here will fail loudly if
 * they drift — the card will simply seat in the wrong place.
 */
export const SLOT_HEIGHT_FRACTION = 0.24
export const SLOT_FORWARD_OF_CENTRE = -0.02

/**
 * The orientation a card takes once seated in the slot: standing upright,
 * face pointing out of the safe (+X, the same outward normal the door's own
 * face has) rather than lying flat the way it starts on the chart.
 *
 * Built as an explicit basis rather than an Euler angle, in keeping with this
 * file's rule against going through Euler rotations for anything that also
 * has to slerp. The assumption underneath it — that a card is baked flat with
 * local +Y as its face normal, +X along its length and +Z across its width —
 * cannot be checked against real geometry until `card_blue`/`card_red` exist
 * in the GLB; treat this as best-effort and revisit the axis assignment once
 * they land.
 */
export const SLOT_QUAT = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
)

export const IDENTITY_QUAT = new Quaternion()

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** Time constants for the exponential chases below — how long it takes each
 *  animated part to close most of the gap to wherever the current phase says
 *  it belongs. Not a scripted [start, end] timeline like `AboutBook`'s: the
 *  safe's phases can be re-entered in almost any order (a refusal returns
 *  straight to idle, a second tap can follow immediately), so a target that
 *  moves and a chase that always heads toward wherever it currently is suits
 *  the state machine better than authoring a transition for every phase pair. */
export const DOOR_TIME_CONSTANT = 0.4
export const CARD_TIME_CONSTANT = 0.25
export const HOVER_TIME_CONSTANT = 0.15

export const HOLD_DISTANCE = 0.28
export const HOVER_LIFT = 0.01
export const HOVER_OPACITY = 0.4

/** How far in front of the camera the granted contents rise to once the door
 *  is open, and how far apart the two rest once presented — far enough that
 *  the half-hull (scaled up below) doesn't swallow the key. The boat sits
 *  dead centre, the more prominent of the two placements; the key is offset
 *  to the side and slightly lower so the two never fight for the same patch
 *  of air on the rare token that grants both at once. */
export const CONTENTS_DISTANCE = 0.42
export const BOAT_LATERAL_OFFSET = 0
export const BOAT_VERTICAL_OFFSET = 0.02
export const KEY_LATERAL_OFFSET = 0.17
export const KEY_VERTICAL_OFFSET = -0.05

/**
 * How large the contents read once presented. This is deliberate showmanship,
 * not a units bug: the half-hull is modelled at its real ~110 mm length and
 * the key at ~55 mm, and at `CONTENTS_DISTANCE` either would read as a speck
 * a visitor has to lean in to identify. Scaling them up as they clear the
 * cavity is the same "the object comes to the camera, not the camera to the
 * object" trick `AboutBook.tsx` plays with its presentation pose, just
 * applied to size as well as position.
 */
export const BOAT_PRESENT_SCALE = 2
export const KEY_PRESENT_SCALE = 3

/** How long the rise-and-settle takes to close most of the gap to its
 *  target — slower than `CARD_TIME_CONSTANT` so the contents read as being
 *  lifted out under their own weight rather than snapping into place the way
 *  a held card does. */
export const CONTENTS_TIME_CONSTANT = 0.5

/** A slow turn about the vertical while presented, so the contents read as
 *  objects being shown off rather than pasted flat onto the frame. */
export const CONTENTS_SPIN_SPEED = MathUtils.degToRad(20)
/** The presented contents spin about world up, not their own local axis —
 *  they're objects turning on an invisible turntable, not tumbling. */
export const PRESENT_SPIN_AXIS = /*@__PURE__*/ new Vector3(0, 1, 0)

/** "At rest" threshold for the contents' uniform scale — the third leg of
 *  the arrival check alongside `ARRIVAL_POS_EPS`/`ARRIVAL_ANGLE_EPS`, needed
 *  because these two objects, unlike the door or the cards, also animate
 *  size on the way home. */
export const ARRIVAL_SCALE_EPS = 0.01

export const VERIFY_PULSE_AMPLITUDE = 0.0015
export const VERIFY_PULSE_FREQUENCY = 5

export const DOOR_SHAKE_DURATION = 0.4
export const DOOR_SHAKE_AMPLITUDE = MathUtils.degToRad(4)
export const DOOR_SHAKE_FREQUENCY = 26

/** "Arrived" thresholds. Below these, an exponential chase (which is only
 *  ever asymptotically close) counts as having reached its target — used both
 *  for the tap handshake and for deciding when it's safe to call `onExited`. */
export const ARRIVAL_POS_EPS = 0.004
export const ARRIVAL_ANGLE_EPS = MathUtils.degToRad(3)

export type HoldPose = { position: Vector3; quaternion: Quaternion }

/**
 * Where a card should be heading right now, given the phase and whether it's
 * the one currently in hand. Pure and allocation-free — callers supply the
 * scratch vectors to mutate, the same discipline the `useFrame` below applies
 * to its own temporaries.
 */
export function resolveCardTarget(
  active: boolean,
  phase: SafePhase,
  isHeld: boolean,
  anchor: Vector3,
  holdPose: HoldPose | null,
  slotPos: Vector3 | null,
  slotQuat: Quaternion,
  outPos: Vector3,
  outQuat: Quaternion,
): void {
  if (!active || !isHeld) {
    outPos.copy(anchor)
    outQuat.identity()
    return
  }
  switch (phase) {
    case 'holding':
      if (holdPose) {
        outPos.copy(holdPose.position)
        outQuat.copy(holdPose.quaternion)
      } else {
        outPos.copy(anchor)
        outQuat.identity()
      }
      return
    case 'tapping':
    case 'pin':
    case 'verifying':
    case 'open':
      if (slotPos) {
        outPos.copy(slotPos)
        outQuat.copy(slotQuat)
      } else {
        outPos.copy(anchor)
        outQuat.identity()
      }
      return
    default:
      // 'idle' and 'denied' both rest on the chart. `useSafe`'s own doc is
      // plain that a refusal is a resting state, not an error one, so a
      // denied card goes straight back to where it started rather than
      // through some distinct "rejected" pose.
      outPos.copy(anchor)
      outQuat.identity()
  }
}

/**
 * A camera-facing pose at some distance and lateral/vertical offset from the
 * camera. This is the same basis the "holding" capture in the `useFrame`
 * below builds — local +Y pointing back at the camera — factored out here
 * because the presented contents need two of these at once (boat, key)
 * rather than the cards' one. Pure and allocation-free: every vector and
 * matrix is caller-owned scratch, per this file's rule on `useFrame`.
 */
export function computeFacingPose(
  camPos: Vector3,
  camQuat: Quaternion,
  distance: number,
  lateral: number,
  vertical: number,
  forward: Vector3,
  normal: Vector3,
  up: Vector3,
  right: Vector3,
  axisZ: Vector3,
  basis: Matrix4,
  outPos: Vector3,
  outQuat: Quaternion,
): void {
  forward.set(0, 0, -1).applyQuaternion(camQuat)
  normal.copy(forward).negate()
  up.set(0, 1, 0).applyQuaternion(camQuat)
  right.crossVectors(up, normal).normalize()
  // Built as X × Y rather than reusing `up` directly, for the same reason
  // the holding capture below does it — guaranteed orthonormal regardless of
  // how the camera happens to be tilted.
  axisZ.crossVectors(right, normal).normalize()
  basis.makeBasis(right, normal, axisZ)
  outQuat.setFromRotationMatrix(basis)
  outPos.copy(camPos).addScaledVector(forward, distance)
  outPos.addScaledVector(right, lateral)
  outPos.addScaledVector(up, vertical)
}

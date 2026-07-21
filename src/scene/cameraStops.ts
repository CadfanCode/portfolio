import type { Vector3Tuple } from 'three'
import type { SceneState } from '../state/useSceneStore'

const deg = (d: number) => (d * Math.PI) / 180

/**
 * How dragging behaves at a stop.
 * - `orbit` — the camera swings around the target, turntable style.
 * - `firstPerson` — the camera pivots roughly in place, like turning your head.
 */
export type LookMode = 'orbit' | 'firstPerson'

/** Where the camera sits at a stop, what it looks at, and how far it may turn. */
export type CameraStop = {
  position: Vector3Tuple
  target: Vector3Tuple
  look: LookMode
  /** Radians either side of the stop's resting heading. */
  azimuthRange: number
  /**
   * Absolute polar bounds in radians, measured from +Y. Gravity-referenced
   * rather than pose-relative, so "never below the waterline" survives the
   * poses being re-authored.
   */
  polarRange: [min: number, max: number]
}

/**
 * The authored pose for every stop on the path. Exhaustive by type, so adding a
 * scene breaks the build until its pose is defined.
 *
 * Provisional: these are framed against the placeholder box, not real geometry,
 * and get re-authored in Phase 5 once the hull and cabin models land.
 */
export const CAMERA_STOPS: Record<SceneState, CameraStop> = {
  // Wide establishing shot. Matches the <Canvas camera> prop so the initial
  // snap is invisible. Orbits, because circling the hull is the point here.
  ocean: {
    position: [9, 5, 13],
    target: [0, 0.5, 0],
    look: 'orbit',
    azimuthRange: deg(110),
    // Never past 90deg — that would put the camera under the waterline.
    polarRange: [deg(25), deg(88)],
  },
  // Seated eye height, aft, looking forward down the deck.
  cockpit: {
    position: [0, 1.6, 2.5],
    target: [0, 1.3, -2],
    look: 'firstPerson',
    azimuthRange: deg(120),
    polarRange: [deg(40), deg(125)],
  },
  // Below deck, facing forward.
  cabin: {
    position: [0, -0.3, -1],
    target: [0, -0.2, -3.5],
    look: 'firstPerson',
    azimuthRange: deg(135),
    polarRange: [deg(35), deg(135)],
  },
}

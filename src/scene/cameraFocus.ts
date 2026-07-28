import type { Vector3Tuple } from 'three'
import type { SceneState } from '../state/useSceneStore'

/**
 * Close-up camera views of objects inside the boat.
 *
 * A stop (`cameraStops.ts`) is somewhere the visitor stands and looks around. A
 * focus is somewhere the camera goes to *read* one thing — the chart table, the
 * books, the VHF — and while it is there the look controls are off entirely.
 * That is the whole distinction and it is deliberate: at a stop you are a person
 * in a boat, and at a focus you are looking at an object, which is not a moment
 * anyone wants to have to aim a camera through.
 *
 * The three here are the three placeholders. Each becomes an exhibit later — the
 * safe is authentication, the books are the resume and the about, the VHF is the
 * conversation with a passing ship — so the camera work is the first half of
 * each of them, built now because the framing is a property of where the object
 * ended up in the model and is best settled while the model is being settled.
 *
 * ## The numbers
 *
 * Every position and target below is in three.js world space and was measured
 * off the built GLB, not guessed — the same discipline `cameraStops.ts` uses.
 * Blender's (x, y, z) maps to three's (x, z, −y) on export, so a station in
 * `blender/params.py` is `station − 3.8075` here. What the model puts where:
 *
 *     chart table block   x −1.18…−0.68, y −0.09…0.49, z  0.71…1.35
 *     the safe            x −1.16…−0.95, y  0.49…0.72, z  1.12…1.34
 *     the chart           x −0.95…−0.70, y  0.49…0.50, z  0.89…1.26
 *     the lamp            x −1.10…−0.87, y  0.49…0.82, z  0.74…0.98
 *     books, fwd stbd     x  0.94… 1.06, y  0.57…0.78, z −0.52…−0.24
 *     the VHF             x  0.64… 0.88, y  0.33…0.52, z  1.28…1.35
 *     saloon table        x −0.13… 0.13, y  0.17…0.49, z −0.53… 0.37
 *     settee front        x ±0.42        cabin sole    y −0.19
 *
 * ## Framing
 *
 * The Canvas runs a 50° vertical field, so the visible height at distance d is
 * 2·d·tan(25°) ≈ 0.93·d. Every final leg below is placed so the object fills
 * most of that: the desk group is about 0.8 m across seen from its own corner
 * and is read from 0.76 m, the books are 0.21 m tall and are read from 0.30 m.
 * That is what "takes up most of the frame" costs in metres, and it is why the
 * numbers look uncomfortably close — they are, because a person leaning in to
 * read a book spine is uncomfortably close to it.
 */

export type FocusLeg = {
  position: Vector3Tuple
  target: Vector3Tuple
  /**
   * `smoothTime` for this leg, seconds — camera-controls' own easing constant,
   * not the leg's duration. A leg takes several time constants to resolve, so
   * these numbers are roughly a third of the seconds they cost.
   *
   * That is why they are as small as they are. The first version used 0.5–0.9
   * per leg, on the reasoning that a walk should feel unhurried; five of those
   * is ten seconds of not being able to do anything, and what it produced in
   * testing was a visitor pressing the back button four legs early. A stride is
   * about a third of a second and these are strides.
   */
  smoothTime?: number
}

export type CameraFocus = {
  id: string
  /** Accessible name. Used on the click target and on the exit button. */
  label: string
  /** The stop this focus belongs to. Only reachable from there. */
  scene: SceneState
  /**
   * The clickable volume, centre and full size in metres. A box round the
   * object rather than the object's own mesh: the safe is a 220 mm box and a
   * book spine is 36 mm wide, and asking someone to hit either of those with a
   * mouse across a room is asking them to fail. This is the forgiving version
   * of the same target.
   */
  bounds: { centre: Vector3Tuple; size: Vector3Tuple }
  /** The move in, leg by leg. The last leg is the framing; anything before it
   *  is the approach. Played in reverse (less the last leg) on the way out. */
  path: FocusLeg[]
}

export const CAMERA_FOCUS: Record<string, CameraFocus> = {
  /**
   * The chart table: the safe in its corner, the chart, the lamp over it, the
   * pipe and the pencils.
   *
   * Read from the inboard side and above, which is where the person sitting at
   * it is. Two legs — a turn to port from the companionway, then the lean in —
   * because a single leg from the stop swings the camera through 90° of heading
   * and 0.7 m of travel at once, and what that looks like is a cut.
   */
  desk: {
    id: 'desk',
    label: 'The chart table',
    scene: 'cabin',
    bounds: { centre: [-0.925, 0.52, 1.03], size: [0.52, 0.62, 0.66] },
    path: [
      { position: [-0.1, 1.0, 0.95], target: [-0.7, 0.62, 1.05], smoothTime: 0.3 },
      { position: [-0.34, 0.92, 0.68], target: [-0.93, 0.6, 1.03], smoothTime: 0.5 },
    ],
  },

  /**
   * The books on the forward starboard shelf, the two gilt-banded ones among
   * them.
   *
   * The one focus with a real walk, and the reason for it is the geometry. This
   * shelf is beside the saloon table, and the gap between the table's edge
   * (x 0.13) and the settee front (x 0.42) is 290 mm. A person getting to these
   * books goes down the walkway, turns side-on and squeezes through that gap.
   * Owner's brief was to animate exactly that, and the five legs are it:
   *
   *   1  step down off the bottom tread onto the sole, still facing forward
   *   2  forward along the walkway beside the table, weight on the other foot
   *   3  side-step into the gap, turning to face the shelf
   *   4  a second side-step, squaring up
   *   5  lean in
   *
   * The eye height carries the walk: 1.05 on the step, then 0.93, 0.97, 0.92,
   * 0.95 — a bob of four or five centimetres a leg, alternating, which is what
   * a head does when the weight changes feet. Then 0.70 for the last leg, which
   * is not a step at all but the crouch of someone getting their eye down to a
   * shelf at 0.57…0.78.
   *
   * The two placeholder books were moved from the after shelf to this one so
   * that this move could be honest — see `_BOOK_RUNS` in `blender/fitout.py`.
   * Aft there is nothing to squeeze past, and the animation would have been a
   * mime of an obstacle that was not there.
   */
  books: {
    id: 'books',
    label: 'The books on the shelf',
    scene: 'cabin',
    bounds: { centre: [1.0, 0.68, -0.38], size: [0.18, 0.3, 0.34] },
    path: [
      { position: [0.02, 0.93, 0.86], target: [0.1, 0.62, -0.9], smoothTime: 0.3 },
      { position: [0.16, 0.97, 0.28], target: [0.55, 0.66, -0.75], smoothTime: 0.34 },
      { position: [0.33, 0.92, -0.1], target: [0.95, 0.68, -0.55], smoothTime: 0.34 },
      { position: [0.5, 0.95, -0.3], target: [1.0, 0.7, -0.4], smoothTime: 0.3 },
      // Square on the middle of the run, not on the two placeholders at its
      // after end -- framed on those, the other seven books ran off the left of
      // the picture and half the frame was bare liner.
      { position: [0.7, 0.7, -0.38], target: [1.02, 0.68, -0.38], smoothTime: 0.5 },
    ],
  },

  /**
   * The VHF on the after bulkhead, starboard of the companionway steps.
   *
   * Almost behind the viewer at the cabin stop — it is on the bulkhead you came
   * through — so the first leg is a turn on the spot before any travel, which
   * is what makes it read as noticing the thing rather than being flown at it.
   */
  vhf: {
    id: 'vhf',
    label: 'The VHF set',
    scene: 'cabin',
    bounds: { centre: [0.76, 0.45, 1.3], size: [0.34, 0.32, 0.18] },
    path: [
      { position: [0.1, 1.0, 1.02], target: [0.7, 0.6, 1.3], smoothTime: 0.3 },
      { position: [0.55, 0.55, 1.05], target: [0.76, 0.45, 1.32], smoothTime: 0.45 },
    ],
  },
}

export const FOCUS_LIST: readonly CameraFocus[] = Object.values(CAMERA_FOCUS)

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
 *     photo, port bhd     x −0.86…−0.60, y  0.64…0.96, z −0.69…−0.65
 *     photo, stbd bhd     x  0.65… 0.91, y  0.63…0.94, z −0.69…−0.65
 *     saloon table        x −0.13… 0.13, y  0.17…0.49, z −0.53… 0.37
 *     settee front        x ±0.42        cabin sole    y −0.19
 *
 * ## Framing
 *
 * The Canvas runs a 50° vertical field, so the visible height at distance d is
 * 2·d·tan(25°) ≈ 0.93·d. Every final leg below is placed so the object fills
 * most of that: the desk group is about 0.75 m across as it lies under the
 * camera and is read from 0.79 m, the books are 0.21 m tall and are read from
 * 0.26 m, the VHF is 0.12 m tall and is read from 0.25 m. That is what "takes
 * up most of the frame" costs in metres, and it is why the numbers look
 * uncomfortably close — they are, because a person leaning in to read a book
 * spine is uncomfortably close to it.
 *
 * ## Pacing
 *
 * There isn't any, here. A path is a *route* and nothing else: the rig flies
 * every leg of it as one continuous curve and paces the whole thing itself
 * (see `CameraRig`). Legs used to carry their own easing constants, which is
 * what made a walk read as a series of hops — each leg eased in and eased out
 * again, so the camera came to a stop at every waypoint it passed through.
 */

export type FocusLeg = {
  position: Vector3Tuple
  target: Vector3Tuple
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
  /** True for a focus with real camera work but no exhibit behind it yet —
   *  `FocusTargets.tsx` still flies the camera in, but also surfaces the
   *  "coming soon" toast rather than letting the click read as dead. */
  placeholder?: boolean
}

export const CAMERA_FOCUS: Record<string, CameraFocus> = {
  /**
   * The chart table: the safe in its corner, the chart, the lamp over it, the
   * pipe and the pencils.
   *
   * Read from above and inboard — standing at the table's own edge and looking
   * down at it, which is the only angle from which a worktop is a worktop
   * rather than a shelf seen edge-on. The final leg is 40° above the horizontal
   * at 0.79 m, which puts all five objects inside the frame with the safe
   * standing up at the far corner and the chart lying flat under the lamp.
   *
   * The height is what the boat allows and not a round number. The coachroof
   * only carries its full 1.30 m of deckhead inboard of x ≈ ±0.45; outboard of
   * that it falls away to 1.04 m at the cabin side, and it is over the chart
   * table that it falls. An eye at 1.03 m has a quarter of a metre of air above
   * it where it stands and would be wearing the deckhead 200 mm further
   * outboard — so the camera looks down across the table from inboard of the
   * edge rather than standing over the middle of it.
   *
   * Two legs — a turn to port from the companionway, then the lean in — because
   * a single leg from the stop swings the camera through 90° of heading and
   * 0.7 m of travel at once, and what that looks like is a cut.
   */
  desk: {
    id: 'desk',
    label: 'The chart table',
    scene: 'cabin',
    placeholder: true,
    bounds: { centre: [-0.925, 0.52, 1.03], size: [0.52, 0.62, 0.66] },
    path: [
      { position: [-0.12, 1.05, 0.93], target: [-0.75, 0.6, 1.0] },
      { position: [-0.42, 1.03, 0.69], target: [-0.93, 0.52, 1.0] },
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
    bounds: { centre: [1.0, 0.68, -0.336], size: [0.18, 0.3, 0.4] },
    path: [
      { position: [0.02, 0.93, 0.86], target: [0.1, 0.62, -0.9] },
      { position: [0.16, 0.97, 0.28], target: [0.55, 0.66, -0.75] },
      { position: [0.33, 0.92, -0.1], target: [0.95, 0.68, -0.55] },
      { position: [0.5, 0.95, -0.3], target: [1.0, 0.7, -0.4] },
      // Square on the middle of the run, not on the named books at its after
      // end -- framed on those, the other seven books ran off the left of
      // the picture and half the frame was bare liner.
      //
      // The middle moved when `book_github` was added. Its two spacer books
      // and its own spine put another 88 mm on the after end of the run
      // (`blender/fitout.py`'s `_BOOK_TAIL`), taking the centre from -0.380 to
      // -0.336, and the camera back 40 mm so the longer run still fits across
      // the frame on a 4:3 window rather than only on a wide one. Measured off
      // the built model, not guessed: the run spans z -0.518 to -0.155, and at
      // 0.31 m off the spines a 4:3 frame is 0.38 m across at that distance.
      { position: [0.66, 0.7, -0.336], target: [1.02, 0.68, -0.336] },
    ],
  },

  /**
   * The VHF on the after bulkhead, starboard of the companionway steps.
   *
   * Almost behind the viewer at the cabin stop — it is on the bulkhead you came
   * through — so the first leg is a turn on the spot before any travel, which
   * is what makes it read as noticing the thing rather than being flown at it.
   *
   * The framing is square on and dead level: the same height as the set, on its
   * own centreline, a quarter of a metre off its face. Nothing about that is a
   * photograph and that is the point — this becomes the exhibit you talk to a
   * passing ship through, so the display and the two knobs have to sit still in
   * the middle of the frame at a size a finger can find, not be seen at a rake
   * from the settee. Off the built model: the set is x 0.640…0.820,
   * y 0.400…0.520, its face stands at z 1.278 and the display is the panel
   * x 0.658…0.758, y 0.456…0.502. Aiming at x 0.75 rather than at the set's own
   * centre carries the handset on its clip (out to x 0.884) into frame beside
   * it — to the *left*, because this is the one view in the boat that faces
   * aft, and facing aft puts starboard on the left of the picture. The coiled
   * cord hangs out of the bottom of it, as it does on the boat.
   */
  vhf: {
    id: 'vhf',
    label: 'The VHF set',
    scene: 'cabin',
    placeholder: true,
    bounds: { centre: [0.76, 0.45, 1.3], size: [0.34, 0.32, 0.18] },
    path: [
      { position: [0.1, 1.0, 1.02], target: [0.7, 0.6, 1.3] },
      { position: [0.75, 0.46, 1.025], target: [0.75, 0.46, 1.3] },
    ],
  },

  /**
   * The framed photograph of the boat, hung to port of the doorway forward.
   *
   * The bulkhead's saloon face stands at z −0.689 and the moulding is 0.018 m
   * proud of it, so the frame's own front face — and the plaque bolted to its
   * bottom rail — sit at z −0.671. That is the plane the final leg reads
   * square on: dead level, dead on the wall normal, no attempt to survey out
   * the frame's own 0.6° of roll, because that roll is the point — it is the
   * picture that hangs a hair crooked, not the camera that is careless.
   *
   * The moulding stands 0.328 m tall; read from 0.440 m it fills 80% of the
   * frame by this file's 0.93·d rule, with room either side down to a 2:3
   * portrait window (0.256 m of width needs an aspect no narrower than 0.63).
   *
   * Two legs for the same reason `vhf` has two: a step forward along the
   * walkway beside the saloon table (which the first leg passes above and
   * outboard of — the table spans x ±0.13, z −0.53…0.37 at y 0.49, and the
   * settees' own backrests top out at y 0.59, so nothing in the cabin is
   * clipped crossing to this wall) at eye height, turning to square up on
   * the bulkhead before any real approach — then the lean in.
   */
  'photo-boat': {
    id: 'photo-boat',
    label: 'The photograph of the boat',
    scene: 'cabin',
    bounds: { centre: [-0.73, 0.799, -0.66], size: [0.3, 0.37, 0.06] },
    path: [
      { position: [-0.16, 1.0, 0.56], target: [-0.62, 0.86, -0.5] },
      { position: [-0.73, 0.799, -0.231], target: [-0.73, 0.799, -0.671] },
    ],
  },

  /**
   * The framed photograph of the dogs, hung to starboard of the doorway
   * forward — the owner's own two, on the panel by the barometer.
   *
   * Same wall, same z −0.671 front face, same dead-square and dead-level
   * final leg for the same reason: the camera stays honest so the frame's
   * own 0.8° of roll is what reads as a picture hung by hand.
   *
   * This moulding is 0.308 m tall; read from 0.410 m it fills 81% of the
   * frame, again with a 2:3 window still wide enough at 0.256 m across. On a
   * wide window only, the forward end of the book run (x 0.94…1.06,
   * z −0.52…−0.24) shows just inside the right edge of frame, receding away
   * — left in deliberately, since that is exactly what leaning in to a
   * picture beside a bookshelf actually looks like.
   *
   * The first leg turns to face the bulkhead from beside the saloon table
   * before travelling in, passing above the settee backrests (top y 0.59)
   * the whole way, same as the port photograph's approach.
   */
  'photo-dogs': {
    id: 'photo-dogs',
    label: 'The photograph of the dogs',
    scene: 'cabin',
    bounds: { centre: [0.78, 0.787, -0.66], size: [0.3, 0.35, 0.06] },
    path: [
      { position: [0.16, 1.0, 0.56], target: [0.62, 0.85, -0.5] },
      { position: [0.78, 0.787, -0.261], target: [0.78, 0.787, -0.671] },
    ],
  },
}

export const FOCUS_LIST: readonly CameraFocus[] = Object.values(CAMERA_FOCUS)

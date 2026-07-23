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
   *
   * Worth holding on to when reading the numbers below: polar is the angle of
   * the *camera* from its pivot, so for a first-person stop it runs backwards
   * from intuition. 90° is looking level; **below** 90° is looking down (the
   * camera has risen above its pivot) and **above** 90° is looking up. That is
   * why the aboard stops carry maxima well past 90° — that is what lets you
   * crane up at the masthead.
   */
  polarRange: [min: number, max: number]
}

/**
 * The authored pose for every stop on the path. Exhaustive by type, so adding a
 * scene breaks the build until its pose is defined.
 *
 * Measured against the real boat, not guessed. All of these numbers were taken
 * off the built model in three.js coordinates — y up from the waterline, bow at
 * −z, stern at +z — so they can be checked:
 *
 *     cockpit sole (grating)  y 0.33       seats            y 0.53
 *     companionway opening    z 1.17…1.37, y 0.51…1.39
 *     coachroof top           y 1.44       boom underside   y 2.00
 *     cabin sole              y −0.19      settee cushions  y 0.30
 *     saloon table top        y 0.49       saloon deckhead  y ~1.28
 *     masthead                y 10.02      hull ends        z ±3.81
 *
 * The two aboard stops can be authored directly against that rest geometry
 * because of how the motion is split (see `PortfolioWorld`): once the camera is
 * aboard the coupling factor is 1, which makes the boat frame the identity and
 * moves the rocking onto the sea instead. The boat is therefore exactly where
 * the model puts it whenever you are standing on it.
 */
export const CAMERA_STOPS: Record<SceneState, CameraStop> = {
  /**
   * Off the starboard bow, high enough to see down onto the deck and far enough
   * out that the whole rig fits — the masthead is 10 m up, so the framing is set
   * by the mast, not the hull. Roughly 14 m out on a 50° vertical field leaves
   * about 13 m of visible height for a 10 m boat: it fills the frame without the
   * masthead clipping the top edge, which the old placeholder pose did.
   *
   * Starboard is the windward side on this tack — the sails are set to port — so
   * the hull and deck read clean instead of through a genoa, and the
   * registration on the mainsail faces us the right way round.
   */
  ocean: {
    position: [11, 6, -9],
    target: [0, 4.2, -0.2],
    look: 'orbit',
    azimuthRange: deg(110),
    // Never past 90deg — that would put the camera under the waterline.
    polarRange: [deg(25), deg(88)],
  },
  /**
   * In the cockpit, aft and just to starboard, at the height of someone perched
   * on the coaming rather than standing: 1.58 m above the water is 1.25 m above
   * the cockpit sole, which clears the coachroof (1.44 m) so the view runs
   * forward over it down the deck, and still passes under the boom (2.00 m) —
   * on a boat this size a standing adult wears the boom, and a camera that
   * floats through it reads as a mistake.
   *
   * The resting look is forward down the boat: companionway, coachroof, mast and
   * the foredeck beyond. Polar reaches 150° so you can crane up the rig to the
   * masthead, which is 70° above the eye from here.
   */
  cockpit: {
    position: [0.34, 1.62, 3.15],
    target: [0, 1.1, -1.5],
    look: 'firstPerson',
    azimuthRange: deg(140),
    polarRange: [deg(30), deg(150)],
  },
  /**
   * Below, standing on the companionway steps and looking forward down the
   * saloon — table, both settees, the mast post, and the bulkhead doorway
   * through to the forepeak. This is the view the boat photographs in.
   *
   * On the steps rather than down in the saloon on purpose. The saloon is only
   * 1.9 m long, so a camera standing in it has the table underfoot and outside
   * the frame entirely; from the steps there is 1 m of room in front of the lens
   * and the whole saloon composes. It is also where you would actually be, one
   * step down, having just come below.
   *
   * The eye is at 1.05 m, seated height rather than standing. That is not a
   * compromise, it is the boat: there is 1.28 m of headroom over the saloon and
   * the brochure only ever claimed standing headroom at the galley. The lens
   * sits 0.67 m clear above the top tread, so nothing clips when you look about.
   *
   * Azimuth is generous because the way out is behind you — turning to find the
   * companionway is the point, and it is how you would actually leave.
   */
  cabin: {
    position: [0, 1.05, 1.05],
    target: [0, 0.65, -1.3],
    look: 'firstPerson',
    azimuthRange: deg(150),
    polarRange: [deg(35), deg(140)],
  },
}

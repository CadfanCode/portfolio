import type { Vector3Tuple } from 'three'
import { smoothstep } from './mathUtils'

/**
 * The opening shot.
 *
 * The camera cuts in high above the boat and dead astern of it, buried in
 * cloud, falls fast, breaks out of the cloud base with the boat a long way off,
 * then decelerates the whole rest of the way down the wake and settles into the
 * cockpit stop. One continuous move, no cuts, ending exactly on the pose in
 * `CAMERA_STOPS.cockpit` so the rig can hand over without a seam.
 *
 * Two hard limits shape the path, and both are properties of the world rather
 * than taste — moving a waypoint without checking them will break the shot:
 *
 * 1. **The sea ends at ±200.** `Ocean` is a 400×400 plane. From high up and
 *    looking down at a shallow angle the top of the frame reaches past that
 *    edge, and `fogExp2` at density 0.0016 has only fogged ~10% by 200 m, so
 *    the edge would be plainly visible. The fix is angle, not distance: every
 *    waypoint below the cloud base is steep enough that the top corner ray
 *    still lands inside the plane at 21:9. At [0, 52, 44] that ray hits the
 *    water at x 138, z −84 — inside, with room.
 * 2. **Above the cloud base, the whiteout does the hiding.** The waypoints
 *    above y 50 do *not* satisfy (1) — from [0, 118, 74] the top corner ray
 *    lands at x 226 on a wide monitor, past the edge. That is fine only because
 *    `CLOUD_BASE` sits at 50 and `introHaze` is near-opaque above it. The cloud
 *    band is load-bearing scenery, not decoration: raise `CLOUD_BASE` above the
 *    breakout waypoint and the sea's corner shows through.
 *
 * The overcast dome (`Weather`) is a sphere of radius 300 centred on the origin,
 * so the start pose at 139 m from origin is still comfortably inside it and
 * reads as sky rather than as a nearby wall.
 */

/** A pose on the opening flight: where the camera is, and what it is aimed at. */
export type IntroWaypoint = {
  position: Vector3Tuple
  target: Vector3Tuple
}

/**
 * The path, in order. Fed to two Catmull-Rom curves — one through the positions,
 * one through the targets — and sampled with a shared parameter so the aim never
 * desynchronises from the eye.
 *
 * The x drift is deliberate and small. Dead-centre on the boat's axis for eight
 * seconds reads as flat, so the descent leans a metre or two to starboard through
 * the middle of the fall and comes back to the cockpit's own 0.34 at the end.
 * It stays inside the boat's beam throughout, which is what keeps the shot
 * reading as "directly astern" rather than as an arc.
 */
export const INTRO_PATH: readonly IntroWaypoint[] = [
  // Cut in inside the top of the cloud deck. The boat is 139 m away and entirely
  // hidden; the first thing on screen is white.
  { position: [0, 118, 74], target: [0, 6, 0] },
  // Falling hard, still blind.
  { position: [0.6, 82, 60], target: [0, 5, 0] },
  // The breakout. Cloud base is 50, so this is the first frame with the boat in
  // it — 68 m out, small in a 50° frame, which is the "far away on first sight"
  // the shot is built around. Everything after this decelerates.
  { position: [1.4, 52, 44], target: [0, 4.5, 0] },
  { position: [1.8, 26, 28], target: [0, 4, 0] },
  // Level with the masthead (y 10.02), coming down the wake.
  { position: [1.2, 11, 16], target: [0, 3.2, -0.5] },
  // Just astern of the transom (hull ends at z ±3.81) and above the backstay's
  // reach, swinging the aim forward into the boat.
  { position: [0.5, 4.6, 8.6], target: [0, 2.2, -1.2] },
  // Exactly `CAMERA_STOPS.cockpit`. Must stay in sync with it.
  { position: [0.34, 1.62, 3.15], target: [0, 1.1, -1.5] },
]

/** Seconds for the whole descent, breakout and settle. */
export const INTRO_DURATION = 7.5

/**
 * Distance-eased, not time-eased: the curve below is applied to arc length, so
 * the camera covers ~39% of the 138 m path in the first fifth of the shot (about
 * 36 m/s, which is the "rapid") and the last few metres over more than a second
 * (the "settle"). A plain smoothstep would ease *in* as well, which would waste
 * the fall.
 *
 * There is no easing in at t=0 on purpose. The first frame has no previous frame
 * to be jerky against, so starting at full speed simply reads as cutting into a
 * descent already underway.
 */
export const introEase = (t: number) => 1 - Math.pow(1 - t, 2.2)

/** Seconds to fast-forward the remainder when a visitor skips. */
export const INTRO_SKIP_TIME = 0.8

/** Bottom of the cloud deck. Below this the sea is visible — see note (2) above. */
export const CLOUD_BASE = 50
/** Top of the cloud deck, above the start pose so the shot opens inside it. */
export const CLOUD_TOP = 128

/**
 * Heights of the individual cloud sheets. Uneven on purpose — evenly spaced
 * sheets punch through on a metronome, which reads as a machine rather than as
 * weather.
 */
export const CLOUD_LAYERS: readonly number[] = [51, 61, 72, 84, 97, 111, 124]

/**
 * How much of the frame the cloud whites out at a given altitude, 0…1.
 *
 * A flat base term guarantees the sea's edge is covered anywhere inside the band
 * (see note 2), a top term makes the opening frame almost solid white, and a
 * pulse term per sheet gives the punch-throughs their thump. Capped below 1 so
 * the sheets themselves stay faintly visible through the haze — two seconds of
 * featureless white is a loading screen, not a shot.
 */
export const introHaze = (y: number) => {
  const base = 0.72 * smoothstep(CLOUD_BASE, CLOUD_BASE + 10, y)
  const top = 0.25 * smoothstep(CLOUD_TOP - 20, CLOUD_TOP, y)
  let pulse = 0
  for (const layer of CLOUD_LAYERS) {
    const d = (y - layer) / 6
    pulse = Math.max(pulse, Math.exp(-d * d))
  }
  return Math.min(base + top + 0.3 * pulse, 0.97)
}

/**
 * Whether to skip the opening entirely. A seven-second unskippable swoop is
 * exactly the kind of motion this media query exists to turn off, so those
 * visitors start seated in the cockpit instead.
 */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Where the camera hangs for the new opening beat: level-ish in the cloud
 * tops, before the plummet takes over. 3.9 m up-and-back of `INTRO_PATH[0]`'s
 * position (`[0, 118, 74]`), so the hold's own drift toward that waypoint
 * (see the `INTRO_HOLD_DURATION` doc below) is already carrying the camera
 * forward and down when the flight picks it up, instead of handing off from a
 * dead stop.
 */
export const INTRO_HOLD_START: Vector3Tuple = [0, 121.5, 76]

/**
 * What the camera is aimed at during the hold, roughly 3.3° below level —
 * enough to read as a shot with a horizon in it rather than as looking
 * straight out at nothing, but still well short of the steep look
 * `INTRO_PATH[0]`'s own target commits to.
 */
export const INTRO_HOLD_TARGET: Vector3Tuple = [0, 116, -20]

/**
 * Seconds the whole hold beat takes, title included, before the plummet begins.
 *
 * **This is the knob.** The hold is deliberately long: the card is at full
 * opacity for two full seconds (see the `TITLE_FADE_*` constants below) with
 * roughly another second and a half of fade either side, which is what a film
 * title actually gets and what makes the beat read as a title rather than as a
 * flash. It puts the whole opening at ~13 s though, and that is a lot to ask of
 * a visitor, so this is the first number to cut if the opening starts to feel
 * indulgent — shorten it and pull the four title beats in to match. Any
 * gesture skips the whole thing (see `INTRO_HOLD_SKIP_TIME`), and a visitor who
 * has asked for reduced motion never sees it at all.
 */
export const INTRO_HOLD_DURATION = 5.6

/**
 * Seconds into the hold when the tilt down onto the flight's own first aim
 * begins. Held marginally *before* the title's fade-out start so the tilt and
 * the fade overlap — the camera is already leaving the card behind as it lifts
 * out of frame, rather than the two happening as separate beats.
 */
export const INTRO_TILT_START = 4.1

/** Seconds to fast-forward the remainder of the hold when a visitor skips. */
export const INTRO_HOLD_SKIP_TIME = 0.5

/**
 * The title card's world position for the new hold beat. 55 m along the
 * hold's opening sightline (`INTRO_HOLD_START` toward `INTRO_HOLD_TARGET`),
 * which centres the card in frame rather than off to one side of where the
 * lens is pointed — the camera barely moves during the hold, so unlike the
 * old flown-through card there is no parallax to design around.
 */
export const TITLE_POSITION: Vector3Tuple = [0, 118.3, 21.1]

/** The title's two lines: the name, and the smaller, letter-spaced subtitle under it. */
export const TITLE_LINES = { name: 'Cai Birch', subtitle: 'Software Developer' } as const

/**
 * The card's width in world units. At fov 50 (set on the `Canvas` in
 * `App.tsx`) the frame at the card's 55 m distance is ~51.3 m tall and
 * ~91.2 m wide (`2 * 55 * tan(25°)` and that times the 16:9-ish aspect), so a
 * 56 m card fills a bit over half the frame's width — read comfortably during
 * a static hold rather than needing to be arrived at.
 */
export const TITLE_WIDTH = 56
export const TITLE_HEIGHT = 28

/** Seconds into the hold when the title starts fading in — after `IntroVeil`'s own 1.1 s fade has cleared. */
export const TITLE_FADE_IN_START = 0.9
/** Seconds into the hold when the title finishes fading in. */
export const TITLE_FADE_IN_END = 2.2
/**
 * Seconds into the hold when the title starts fading out. Two full seconds
 * after `TITLE_FADE_IN_END`, so the card sits at full opacity for a genuine
 * beat, and just after `INTRO_TILT_START` so the fade and the tilt overlap.
 */
export const TITLE_FADE_OUT_START = 4.2
/** Seconds into the hold when the title has fully faded out, comfortably before the plummet. */
export const TITLE_FADE_OUT_END = 5.3

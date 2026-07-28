import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three'
import type { Vector3Tuple } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { CAMERA_FOCUS, type FocusLeg } from './cameraFocus'
import { CAMERA_STOPS, type CameraStop } from './cameraStops'
import {
  INTRO_DURATION,
  INTRO_HOLD_DURATION,
  INTRO_HOLD_SKIP_TIME,
  INTRO_HOLD_START,
  INTRO_HOLD_TARGET,
  INTRO_PATH,
  INTRO_SKIP_TIME,
  INTRO_TILT_START,
  introEase,
} from './introFlight'
import { clamp01, smoothstep01 } from './mathUtils'

/**
 * Orbit radius used at first-person stops. Small enough that turning reads as a
 * head movement rather than the camera swinging through the hull, but not so
 * small that the spherical maths gets unstable.
 */
const FIRST_PERSON_PIVOT = 0.1

const eye = new Vector3()
const pivot = new Vector3()
const aim = new Vector3()
const scratchA = new Vector3()
const scratchB = new Vector3()

// The hold beat's own endpoints, hoisted once rather than rebuilt every frame.
// `holdEyeEnd`/`holdAimEnd` are `INTRO_PATH[0]`'s own pose — the hold drifts
// onto the flight's first waypoint so the handover at `h >= 1` is exact.
const holdEyeStart = new Vector3(...INTRO_HOLD_START)
const holdAimStart = new Vector3(...INTRO_HOLD_TARGET)
const holdEyeEnd = new Vector3(...INTRO_PATH[0].position)
const holdAimEnd = new Vector3(...INTRO_PATH[0].target)

const TAU = Math.PI * 2

/** Open every limit, so leftovers from the last stop can't clamp a flight. */
function releaseLimits(c: CameraControlsImpl) {
  c.minAzimuthAngle = -Infinity
  c.maxAzimuthAngle = Infinity
  c.minPolarAngle = 0
  c.maxPolarAngle = Math.PI
}

/**
 * The point the camera orbits at a stop, written into `out`.
 *
 * For an orbit stop that is the stop's own target — the camera swings around
 * the boat. For a first-person stop it collapses to a point just ahead of the
 * eye, so dragging turns the head instead of swinging the camera through the
 * hull. The pivot lies on the line from the eye to the target, so the view
 * direction — and therefore the framing — is identical either way; only the
 * radius the drag swings on changes.
 *
 * This is handed straight to `setLookAt` as the target rather than applied
 * afterwards with `setOrbitPoint`, and that is load-bearing. `setOrbitPoint`
 * re-derives the orbit radius from the camera's *current* world position, and
 * camera-controls does not flush a new pose onto the camera until its next
 * `update()` — so calling it right after `setLookAt` measured the radius from
 * wherever the camera happened to be before the move. At the cockpit stop that
 * was the Canvas's opening pose, 14 m astern: the pivot was correct, the radius
 * was not, and the constraint pass then swung the camera around that 14 m arm
 * and left the viewer sitting out in the sea watching the boat. Building the
 * pivot into the call makes the radius correct by construction.
 */
function orbitTarget(stop: CameraStop, out: Vector3) {
  if (stop.look !== 'firstPerson') return out.set(...stop.target)

  eye.set(...stop.position)
  return out
    .set(...stop.target)
    .sub(eye)
    .normalize()
    .multiplyScalar(FIRST_PERSON_PIVOT)
    .add(eye)
}

/**
 * Pin the look constraints for a stop the camera has just arrived at. Angles
 * only — the pose itself was set by `setLookAt`.
 */
function applyLookConstraints(c: CameraControlsImpl, stop: CameraStop) {
  const [minPolar, maxPolar] = stop.polarRange
  c.minPolarAngle = minPolar
  c.maxPolarAngle = maxPolar

  // Azimuth is heading-relative, so it has to be read off the resting pose.
  const resting = c.azimuthAngle
  c.minAzimuthAngle = resting - stop.azimuthRange
  c.maxAzimuthAngle = resting + stop.azimuthRange
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

/**
 * ## Why the rig flies close-ups itself
 *
 * A close-up is a *route*: the chart table is a turn and a lean, the books are
 * a five-stride walk down the saloon and a crouch at the end of it. Handing
 * those to camera-controls a leg at a time — `setLookAt`, await, `setLookAt`,
 * await — is what the first version did, and it cannot help but hop. Each call
 * is its own critically damped spring, so the camera eases *out* into every
 * waypoint and eases *in* again out of it: five legs is five arrivals, and the
 * owner's word for it was "disjointed", which is exactly right. The waypoints
 * were never meant to be stops. They are the shape of the route.
 *
 * So the rig owns the interpolation for these. The waypoints become two
 * Catmull-Rom curves — one for the eye, one for where it is looking — and the
 * whole move gets a single ease across both. The camera passes *through* the
 * waypoints at speed instead of arriving at each one, and the route is the same
 * route: the curve runs through every position that was authored, it just
 * rounds the corners between them rather than stopping in them.
 *
 * Two details that are less obvious than they look:
 *
 * **The look is carried as angles, not as points.** A stop's target sits 100 mm
 * in front of the eye (`orbitTarget`) while a leg's is a metre or two off, so
 * interpolating the two look-at *points* drags the view around wildly while the
 * numbers themselves move smoothly. Azimuth and polar, unwrapped so a turn
 * takes the short way round, then a fresh target hung off the direction at a
 * fixed distance. What is left is rotation, which is what a head does.
 *
 * **Pacing is by effort, not by distance.** Arc length alone gets the VHF
 * badly wrong: its first waypoint is a turn on the spot, 116 mm of travel
 * carrying 160° of heading, so distance-paced it would whip round in a fifth of
 * a second and then dolly in at a stroll. Every sample therefore costs its
 * travel *plus* its rotation priced in metres (`TURN_COST`), and the move is
 * paced against the total. A turn on the spot then takes about as long as
 * walking the same effort would.
 */

/** Where the camera is and what it is looking at — one point on a route. */
type Waypoint = { position: Vector3Tuple; target: Vector3Tuple }

/** A move in progress. Rebuilt from scratch whenever the store changes. */
type Flight = {
  eye: CatmullRomCurve3
  /** (azimuth, polar, 0) per waypoint — see `aimOf`. */
  aim: CatmullRomCurve3
  /**
   * Cumulative effort at each of `SAMPLES` + 1 evenly spaced curve parameters,
   * normalised to end at 1. Inverted every frame to turn eased progress into a
   * curve parameter, which is what makes the speed even.
   */
  effort: Float32Array
  /** Seconds the whole move takes. */
  duration: number
  elapsed: number
  /** Snap to the authored end pose and hand control back. */
  land: () => void
}

/** Metres of travel per second. A slow walk, because that is what this is. */
const PACE = 1.0

/**
 * What a radian of turn is worth in metres of travel, for pacing.
 *
 * 0.38 puts a 90° turn on the spot at about 0.6 s, which is roughly how long
 * turning 90° on the spot takes.
 */
const TURN_COST = 0.38

/**
 * Floor and ceiling on a flight, seconds.
 *
 * The floor keeps a short lean-in from being a snap. The ceiling is what the
 * books walk runs at — 1.8 m and a 90° turn would price at nearly three
 * seconds, and by about two and a half a visitor has stopped watching a walk
 * and started waiting for one to finish.
 */
const MIN_FLIGHT = 1.0
const MAX_FLIGHT = 2.4

/** How finely the effort table samples the curves. */
const SAMPLES = 240

/** Distance the in-flight look-at point is hung off the eye. Any would do. */
const LOOK_AHEAD = 1

/**
 * A waypoint's look direction as (azimuth, polar, 0), packed into a Vector3 so
 * one Catmull-Rom curve can carry both angles.
 */
function aimOf(wp: Waypoint, out: Vector3) {
  scratchA
    .set(...wp.target)
    .sub(scratchB.set(...wp.position))
    .normalize()
  return out.set(
    Math.atan2(scratchA.x, scratchA.z),
    Math.acos(MathUtils.clamp(scratchA.y, -1, 1)),
    0,
  )
}

/**
 * Turn a route into a flight, or null if there is nowhere to go — which happens
 * for real, when the back button is pressed before the camera has left the
 * stop.
 */
function planFlight(route: Waypoint[], land: () => void): Flight | null {
  const eyes: Vector3[] = []
  const aims: Vector3[] = []

  for (const wp of route) {
    const position = new Vector3(...wp.position)
    const angles = aimOf(wp, new Vector3())

    const previous = aims[aims.length - 1]
    if (previous) {
      // Unwrap onto the previous waypoint's branch, so a turn past due south
      // goes the short way instead of unwinding a whole revolution.
      angles.x += Math.round((previous.x - angles.x) / TAU) * TAU

      // Centripetal Catmull-Rom divides by the gap between control points, so a
      // repeated point is a curve full of NaN. A millimetre is the same place:
      // keep the later aim, which is the one being flown to.
      if (position.distanceToSquared(eyes[eyes.length - 1]) < 1e-6) {
        eyes[eyes.length - 1] = position
        aims[aims.length - 1] = angles
        continue
      }
    }

    eyes.push(position)
    aims.push(angles)
  }

  if (eyes.length < 2) return null

  const eyeCurve = new CatmullRomCurve3(eyes, false, 'centripetal')
  // Uniform rather than centripetal: these are angles, not a path through
  // space, and the centripetal weighting is only meaningful for the latter.
  const aimCurve = new CatmullRomCurve3(aims, false, 'catmullrom', 0.5)

  const effort = new Float32Array(SAMPLES + 1)
  const lastEye = eyeCurve.getPoint(0, new Vector3())
  const lastAim = aimCurve.getPoint(0, new Vector3())
  let total = 0

  for (let i = 1; i <= SAMPLES; i++) {
    eyeCurve.getPoint(i / SAMPLES, scratchA)
    aimCurve.getPoint(i / SAMPLES, scratchB)
    total +=
      scratchA.distanceTo(lastEye) +
      TURN_COST * Math.hypot(scratchB.x - lastAim.x, scratchB.y - lastAim.y)
    effort[i] = total
    lastEye.copy(scratchA)
    lastAim.copy(scratchB)
  }

  if (total <= 0) return null
  for (let i = 1; i <= SAMPLES; i++) effort[i] /= total

  return {
    eye: eyeCurve,
    aim: aimCurve,
    effort,
    duration: MathUtils.clamp(total / PACE, MIN_FLIGHT, MAX_FLIGHT),
    elapsed: 0,
    land,
  }
}

/** Curve parameter at which `progress` of the flight's total effort is spent. */
function curveParameterAt(effort: Float32Array, progress: number) {
  let low = 0
  let high = effort.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (effort[mid] < progress) low = mid + 1
    else high = mid
  }
  if (low === 0) return 0

  const before = effort[low - 1]
  const span = effort[low] - before
  const within = span > 0 ? (progress - before) / span : 0
  return (low - 1 + within) / SAMPLES
}

/** The rig's own resting easing constant, for plain moves between stops. */
const SMOOTH_TIME = 0.62

/**
 * How many easing time constants a stop-to-stop move is given before the rig
 * stops waiting on camera-controls and moves on. See `fly` for why waiting can
 * be forever.
 *
 * Three and a half: a critically damped spring is within about 3% of its target
 * after three time constants and under a pixel after four, so this cannot cut a
 * move short in any way that shows.
 */
const SETTLE = 3.5

/**
 * Run ahead of drei's own `useFrame`, which updates camera-controls at −1, so
 * the pose written this frame is the pose rendered this frame.
 */
const FRAME_PRIORITY = -2

/**
 * Sole owner of the camera. Glides it between stops when the scene changes,
 * walks it in and out of close-ups, and holds the constraints that keep the
 * viewer aboard.
 */
export function CameraRig() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  // Which close-up the camera is on its way out of, so the exit can retrace the
  // approach. Kept in the store rather than in a ref here — see its
  // declaration for what StrictMode does to the ref version.
  const leaving = useSceneStore((s) => s.leaving)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const arrive = useSceneStore((s) => s.arrive)
  const intro = useSceneStore((s) => s.intro)
  const beginIntro = useSceneStore((s) => s.beginIntro)
  const beginFlight = useSceneStore((s) => s.beginFlight)
  const endIntro = useSceneStore((s) => s.endIntro)

  const controls = useRef<CameraControlsImpl>(null)
  const hasMounted = useRef(false)
  const flight = useRef<Flight | null>(null)
  /** Seconds into the hold beat, unaffected by a skip. */
  const holdElapsed = useRef(0)
  /**
   * Set on a skip gesture that arrives during the hold: the progress fraction
   * at that moment, and how long the fast-forward has been running. Same
   * `{ from, elapsed }` shape as `introSkip` below — see there for the remap.
   */
  const holdSkip = useRef<{ from: number; elapsed: number } | null>(null)
  /**
   * Set the moment a skip gesture arrives during the hold, so the `'playing'`
   * branch below knows one gesture was meant to skip the whole opening, not
   * just the beat it landed in, and arms its own skip on the first frame it
   * gets.
   */
  const skipFlight = useRef(false)
  /** Seconds into the opening flight, unaffected by a skip. */
  const introElapsed = useRef(0)
  /**
   * Set on the first skip gesture during the flight: the eased progress at
   * that moment, and how long the fast-forward has been running. Null while
   * un-skipped.
   */
  const introSkip = useRef<{ from: number; elapsed: number } | null>(null)

  // Built once from the authored waypoints — one curve for the eye, one for
  // the aim, sampled with a shared parameter every frame so the look never
  // drifts out of sync with the fall (see introFlight.ts).
  const introCurves = useMemo(() => {
    const eyePoints = INTRO_PATH.map((wp) => new Vector3(...wp.position))
    const aimPoints = INTRO_PATH.map((wp) => new Vector3(...wp.target))
    return {
      eye: new CatmullRomCurve3(eyePoints),
      aim: new CatmullRomCurve3(aimPoints),
    }
  }, [])

  // Pan, dolly and zoom stay off for good — the viewer looks around, never flies.
  useEffect(() => {
    const c = controls.current
    if (!c) return

    const { ACTION } = CameraControlsImpl
    c.mouseButtons.right = ACTION.NONE
    c.mouseButtons.wheel = ACTION.NONE
    c.mouseButtons.middle = ACTION.NONE
    c.touches.two = ACTION.NONE
    c.touches.three = ACTION.NONE
  }, [])

  // Snap to the top of the opening flight before the first paint. A plain
  // effect would let one frame render at the Canvas's own camera prop first,
  // which flashes the ocean stop for a frame before the cut to altitude.
  // Guarded on `intro === 'pending'` so StrictMode's mount-cleanup-remount in
  // development can't restart the flight the second time through.
  // `beginIntro` goes first because it is the thing that decides whether there
  // is a flight at all: a visitor who has asked for reduced motion is sent
  // straight to `'done'` and starts seated, and snapping to altitude before
  // asking would put them a frame deep in cloud on their way there.
  useLayoutEffect(() => {
    const c = controls.current
    if (!c || intro !== 'pending') return

    beginIntro()
    if (useSceneStore.getState().intro !== 'holding') return

    releaseLimits(c)
    c.setLookAt(...INTRO_HOLD_START, ...INTRO_HOLD_TARGET, false)
  }, [intro, beginIntro])

  // A pointerdown, keydown or touch anywhere fast-forwards the intro instead
  // of cutting it off — see the useFrame branches below for the remaps. One
  // gesture skips whichever beat it lands in *and* whatever is still ahead:
  // arriving during the hold arms both `holdSkip` and `skipFlight`, so the
  // 'playing' branch knows to arm its own `introSkip` the instant it starts
  // rather than waiting for a second gesture. It is also the gesture
  // `scene/audio/engine.ts` falls back to when the browser refused its opening
  // request to start the context, so on a strict browser skipping the intro is
  // what starts the soundscape as well.
  useEffect(() => {
    if (intro !== 'holding' && intro !== 'playing') return

    const skip = () => {
      if (intro === 'holding') {
        if (holdSkip.current) return
        const h = clamp01(holdElapsed.current / INTRO_HOLD_DURATION)
        holdSkip.current = { from: h, elapsed: 0 }
        skipFlight.current = true
        return
      }
      if (introSkip.current) return
      const t = Math.min(introElapsed.current / INTRO_DURATION, 1)
      introSkip.current = { from: introEase(t), elapsed: 0 }
    }

    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    window.addEventListener('touchstart', skip)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('touchstart', skip)
    }
  }, [intro])

  // Dragging is ignored while the camera is in flight, and switched off
  // entirely inside a close-up: a focus is a fixed framing of one object, and
  // being able to nudge it off that framing is the whole thing the owner asked
  // not to have. Programmatic moves still run — camera-controls only gates user
  // input on `enabled`.
  useEffect(() => {
    const c = controls.current
    if (c) c.enabled = intro === 'done' && !isTransitioning && focus === null
  }, [intro, isTransitioning, focus])

  // Drive the move, then lock the look constraints on arrival. The first run
  // snaps, so we don't glide in from wherever the Canvas camera started.
  useEffect(() => {
    const c = controls.current
    if (!c) return

    // The intro flight owns the camera until it lands. `hasMounted` is left
    // untouched here on purpose: when `endIntro()` sets `scene` to `'cockpit'`,
    // this effect runs for real with `animate` still false, snaps to a pose
    // the camera is already sitting at (a no-op visually), calls `arrive()`,
    // and applies the cockpit's look constraints. That is the handover from
    // the scripted flight to ordinary free-look, not a bug.
    if (intro !== 'done') return

    const stop = CAMERA_STOPS[scene]
    const view = focus ? CAMERA_FOCUS[focus] : null
    const exiting = focus === null && leaving ? CAMERA_FOCUS[leaving] : null
    const animate = hasMounted.current
    hasMounted.current = true

    releaseLimits(c)
    // Whatever was in the air is abandoned here rather than finished: the store
    // has already moved on, and the flight built below starts from wherever
    // that left the camera.
    flight.current = null

    /** Settle at the stop: authored pose, then the look limits it carries. */
    const landAtStop = () => {
      orbitTarget(stop, pivot)
      c.setLookAt(...stop.position, pivot.x, pivot.y, pivot.z, false)
      applyLookConstraints(c, stop)
      arrive()
    }

    /**
     * Settle in a close-up. No `applyLookConstraints` — the look is off in
     * there, so there is nothing to constrain, and pinning limits here would
     * leave them behind for the stop to inherit on the way out.
     */
    const landAtView = (leg: FocusLeg) => () => {
      c.setLookAt(...leg.position, ...leg.target, false)
      arrive()
    }

    /** Fly the route, or just be there if there is no distance in it. */
    const take = (route: Waypoint[], land: () => void) => {
      const planned = animate ? planFlight(route, land) : null
      if (planned) flight.current = planned
      else land()
    }

    /** The pose the camera is in right now, as the route's first waypoint. */
    const here = (): Waypoint => {
      c.getPosition(scratchA)
      c.getTarget(scratchB)
      return {
        position: [scratchA.x, scratchA.y, scratchA.z],
        target: [scratchB.x, scratchB.y, scratchB.z],
      }
    }

    if (view) {
      take([here(), ...view.path], landAtView(view.path[view.path.length - 1]))
      return
    }

    if (exiting) {
      // Out the way we came in. Which leg to retrace from is asked of the
      // camera rather than assumed: the back button works mid-approach
      // (`clearFocus`), so the camera may only have got two strides down the
      // saloon, and replaying the whole path from its far end would walk it
      // forwards to the shelf before letting it leave.
      c.getPosition(scratchA)
      let reached = 0
      let nearest = Infinity
      exiting.path.forEach((leg, i) => {
        const distance = scratchA.distanceToSquared(scratchB.set(...leg.position))
        if (distance < nearest) {
          nearest = distance
          reached = i
        }
      })

      const retrace = exiting.path.slice(0, reached).reverse()
      take(
        [here(), ...retrace, { position: stop.position, target: stop.target }],
        landAtStop,
      )
      return
    }

    // A plain move between stops. Left to camera-controls, which interpolates
    // the orbit rather than the straight line between the two poses — that arc
    // is what carries the camera around the boat on the way aboard instead of
    // through the rig, and it is the one thing a curve through two authored
    // waypoints could not reproduce.
    let cancelled = false

    /**
     * The race is not belt-and-braces, it is the only thing that makes this
     * safe. `setLookAt`'s promise resolves on camera-controls' own `rest`
     * event, and `rest` is only dispatched from inside the branch of `update()`
     * that runs when the controls *are still moving* and their deltas have just
     * fallen below `restThreshold`. Ask for a pose near enough to the current
     * one and the very next frame is already under that threshold: `update()`
     * takes the "not updated" branch, dispatches `sleep`, and `rest` never
     * comes. The promise is then never resolved.
     *
     * The failure is the worst kind this app has: the await never returns,
     * `arrive()` is never called, `isTransitioning` stays true, and every
     * hotspot and the look controls are dead until the page is reloaded. It
     * took a stuck cockpit to find, because from the outside it looks like
     * clicks being ignored.
     *
     * So the move also gets a deadline of a few time constants — the point at
     * which a critically damped spring is there to within a pixel anyway. If
     * the promise resolves first, nothing is lost; if it never resolves, the
     * landing happens regardless.
     */
    const run = async () => {
      c.smoothTime = SMOOTH_TIME
      orbitTarget(stop, pivot)
      await Promise.race([
        c.setLookAt(...stop.position, pivot.x, pivot.y, pivot.z, animate),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, animate ? SMOOTH_TIME * SETTLE * 1000 : 0)
        }),
      ])
      if (cancelled) return
      applyLookConstraints(c, stop)
      arrive()
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [scene, focus, leaving, arrive, intro])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return

    if (intro === 'holding') {
      // Un-skipped, the progress fraction comes straight off elapsed time.
      // Skipped, it is remapped so the rest of the hold covers the remaining
      // distance in `INTRO_HOLD_SKIP_TIME` seconds instead — same shape as
      // the flight's own `introSkip` below.
      let h: number
      if (holdSkip.current) {
        holdSkip.current.elapsed += delta
        const skipT = Math.min(holdSkip.current.elapsed / INTRO_HOLD_SKIP_TIME, 1)
        h = MathUtils.lerp(holdSkip.current.from, 1, smoothstep01(skipT))
      } else {
        holdElapsed.current += delta
        h = clamp01(holdElapsed.current / INTRO_HOLD_DURATION)
      }

      // Quadratic ease-in on position: the camera barely creeps at first and
      // is already sliding by the time the plummet takes over, rather than
      // handing off from a dead stop.
      eye.lerpVectors(holdEyeStart, holdEyeEnd, h * h)

      // The aim holds dead still until the tilt begins, then smoothsteps down
      // onto the flight's own first target so the handover at h>=1 is
      // seamless. Read off `h` rather than the raw clock so a skip drags the
      // tilt to completion along with everything else instead of leaving it
      // stranded mid-tilt.
      const holdSeconds = h * INTRO_HOLD_DURATION
      const tilt = smoothstep01(
        clamp01((holdSeconds - INTRO_TILT_START) / (INTRO_HOLD_DURATION - INTRO_TILT_START)),
      )
      aim.lerpVectors(holdAimStart, holdAimEnd, tilt)

      c.setLookAt(eye.x, eye.y, eye.z, aim.x, aim.y, aim.z, false)

      if (h >= 1) {
        // Exact handover onto the flight's own first waypoint, so there is no
        // seam between the hold's own lerp and the Catmull-Rom curve it drops
        // onto below.
        c.setLookAt(...INTRO_PATH[0].position, ...INTRO_PATH[0].target, false)
        beginFlight()
      }
      return
    }

    if (intro === 'playing') {
      introElapsed.current += delta

      // A hold-skip fast-forwards the flight too — arm the flight's own skip
      // on the first frame it runs, so a single gesture clears the whole
      // opening rather than requiring a second one once the plummet starts.
      if (skipFlight.current && !introSkip.current) {
        introSkip.current = { from: 0, elapsed: 0 }
      }

      // Un-skipped, the eased fraction comes straight off elapsed time.
      // Skipped, it is remapped so the rest of the flight covers the
      // remaining distance in `INTRO_SKIP_TIME` seconds instead.
      let e: number
      if (introSkip.current) {
        introSkip.current.elapsed += delta
        const skipT = Math.min(introSkip.current.elapsed / INTRO_SKIP_TIME, 1)
        e = MathUtils.lerp(introSkip.current.from, 1, smoothstep01(skipT))
      } else {
        const t = Math.min(introElapsed.current / INTRO_DURATION, 1)
        e = introEase(t)
      }

      // Converting the eased value from arc-length space to curve-parameter
      // space is what makes the ease control actual metres-per-second, and
      // sampling both curves at the same `u` is what keeps the aim locked to
      // the eye — getPointAt on one and getPoint on the other would desync
      // them the moment the two curves' arc lengths differ.
      // `distance` is typed as required but treated as falsy-optional at
      // runtime (three.js falls back to `u * totalLength` for any falsy
      // value) — 0 gets the same "use u as an arc-length fraction" behaviour
      // as the `undefined` the runtime API actually accepts.
      const u = introCurves.eye.getUtoTmapping(e, 0)
      introCurves.eye.getPoint(u, eye)
      introCurves.aim.getPoint(u, aim)
      c.setLookAt(eye.x, eye.y, eye.z, aim.x, aim.y, aim.z, false)

      if (e >= 1) {
        const cockpit = CAMERA_STOPS.cockpit
        c.setLookAt(...cockpit.position, ...cockpit.target, false)
        endIntro()
      }
      return
    }

    const f = flight.current
    if (!f) return

    f.elapsed += delta
    const progress = f.elapsed / f.duration
    if (progress >= 1) {
      flight.current = null
      f.land()
      return
    }

    // One smoothstep across the whole move: still at both ends, and moving
    // through everything in between. Easing per leg is what made this hop.
    const eased = progress * progress * (3 - 2 * progress)
    const t = curveParameterAt(f.effort, eased)
    f.eye.getPoint(t, eye)
    f.aim.getPoint(t, aim)

    const polar = MathUtils.clamp(aim.y, 1e-3, Math.PI - 1e-3)
    const sinPolar = Math.sin(polar)
    pivot
      .set(sinPolar * Math.sin(aim.x), Math.cos(polar), sinPolar * Math.cos(aim.x))
      .multiplyScalar(LOOK_AHEAD)
      .add(eye)

    c.setLookAt(eye.x, eye.y, eye.z, pivot.x, pivot.y, pivot.z, false)
  }, FRAME_PRIORITY)

  // Fail-safe. isTransitioning gates every click in the app and only this
  // component clears it, so releasing it on unmount avoids a permanent freeze.
  // Must stay in its own effect — running this on every scene change would
  // cancel the flight lock on the transition it exists to guard.
  useEffect(() => () => useSceneStore.getState().arrive(), [])

  return <CameraControls ref={controls} makeDefault smoothTime={SMOOTH_TIME} />
}

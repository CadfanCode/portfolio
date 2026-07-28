import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three'
import type { Vector3Tuple } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { CAMERA_FOCUS, type FocusLeg } from './cameraFocus'
import { CAMERA_STOPS, type CameraStop } from './cameraStops'

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

  const controls = useRef<CameraControlsImpl>(null)
  const hasMounted = useRef(false)
  const flight = useRef<Flight | null>(null)

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

  // Dragging is ignored while the camera is in flight, and switched off
  // entirely inside a close-up: a focus is a fixed framing of one object, and
  // being able to nudge it off that framing is the whole thing the owner asked
  // not to have. Programmatic moves still run — camera-controls only gates user
  // input on `enabled`.
  useEffect(() => {
    const c = controls.current
    if (c) c.enabled = !isTransitioning && focus === null
  }, [isTransitioning, focus])

  // Drive the move, then lock the look constraints on arrival. The first run
  // snaps, so we don't glide in from wherever the Canvas camera started.
  useEffect(() => {
    const c = controls.current
    if (!c) return

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
  }, [scene, focus, leaving, arrive])

  useFrame((_, delta) => {
    const f = flight.current
    const c = controls.current
    if (!f || !c) return

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

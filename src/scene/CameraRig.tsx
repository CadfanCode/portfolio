import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
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

/** The rig's own resting easing constant. Legs may ask for their own. */
const SMOOTH_TIME = 0.8

/**
 * How many easing time constants a leg is given before the rig stops waiting on
 * camera-controls and moves on. See `fly` for why waiting can be forever.
 *
 * Three and a half: a critically damped spring is within about 3% of its target
 * after three time constants and under a pixel after four, so this cannot cut a
 * move short in any way that shows.
 */
const SETTLE = 3.5

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

    let cancelled = false

    /**
     * One leg of a move: aim the camera and wait for it to get there.
     *
     * The race is not belt-and-braces, it is the only thing that makes this
     * safe. `setLookAt`'s promise resolves on camera-controls' own `rest`
     * event, and `rest` is only dispatched from inside the branch of `update()`
     * that runs when the controls *are still moving* and their deltas have just
     * fallen below `restThreshold`. Ask for a pose near enough to the current
     * one and the very next frame is already under that threshold: `update()`
     * takes the "not updated" branch, dispatches `sleep`, and `rest` never
     * comes. The promise is then never resolved.
     *
     * Chaining short legs is exactly the shape that hits it, and the failure is
     * the worst kind this app has: the await never returns, `arrive()` is never
     * called, `isTransitioning` stays true, and every hotspot and the look
     * controls are dead until the page is reloaded. It took a stuck cockpit to
     * find, because from the outside it looks like clicks being ignored.
     *
     * So each leg also gets a deadline of a few time constants — the point at
     * which a critically damped spring is there to within a pixel anyway. If
     * the promise resolves first, nothing is lost; if it never resolves, the
     * sequence carries on regardless.
     */
    const fly = async (
      position: Vector3Tuple,
      target: Vector3Tuple,
      smooth: number,
    ) => {
      c.smoothTime = smooth
      await Promise.race([
        c.setLookAt(...position, ...target, animate),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, animate ? smooth * SETTLE * 1000 : 0)
        }),
      ])
      return !cancelled
    }

    const flyLeg = (leg: FocusLeg) =>
      fly(leg.position, leg.target, leg.smoothTime ?? SMOOTH_TIME)

    const run = async () => {
      if (view) {
        // In: every leg in order, the last one being the framing.
        for (const leg of view.path) {
          if (!(await flyLeg(leg))) return
        }
        c.smoothTime = SMOOTH_TIME
        // No `applyLookConstraints` — the look is off in a close-up, so there
        // is nothing to constrain, and pinning limits here would leave them
        // behind for the stop to inherit on the way out.
        arrive()
        return
      }

      // Out: retrace the approach in reverse, less its last leg — that one is
      // the framing the camera is already sitting in. Walking back out matters
      // for the books, whose way in squeezes past the saloon table; flying
      // straight from the shelf to the companionway would cut through it.
      if (exiting) {
        for (const leg of exiting.path.slice(0, -1).reverse()) {
          if (!(await flyLeg(leg))) return
        }
      }

      orbitTarget(stop, pivot)
      if (!(await fly(stop.position, [pivot.x, pivot.y, pivot.z], SMOOTH_TIME))) {
        return
      }
      applyLookConstraints(c, stop)
      arrive()
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [scene, focus, leaving, arrive])

  // Fail-safe. isTransitioning gates every click in the app and only this
  // component clears it, so releasing it on unmount avoids a permanent freeze.
  // Must stay in its own effect — running this on every scene change would
  // cancel the flight lock on the transition it exists to guard.
  useEffect(() => () => useSceneStore.getState().arrive(), [])

  return <CameraControls ref={controls} makeDefault smoothTime={SMOOTH_TIME} />
}

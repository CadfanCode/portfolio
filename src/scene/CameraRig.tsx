import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { useSceneStore } from '../state/useSceneStore'
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

/**
 * Sole owner of the camera. Glides it between stops when the scene changes and
 * holds the constraints that keep the viewer aboard.
 */
export function CameraRig() {
  const scene = useSceneStore((s) => s.scene)
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

  // Dragging is ignored while the camera is in flight. Programmatic moves still
  // run — camera-controls only gates user input on `enabled`.
  useEffect(() => {
    const c = controls.current
    if (c) c.enabled = !isTransitioning
  }, [isTransitioning])

  // Drive the move, then lock the look constraints on arrival. The first run
  // snaps, so we don't glide in from wherever the Canvas camera started.
  useEffect(() => {
    const c = controls.current
    if (!c) return

    const stop = CAMERA_STOPS[scene]
    const animate = hasMounted.current
    hasMounted.current = true

    releaseLimits(c)
    orbitTarget(stop, pivot)

    let cancelled = false
    void c
      .setLookAt(...stop.position, pivot.x, pivot.y, pivot.z, animate)
      .then(() => {
        if (cancelled) return
        applyLookConstraints(c, stop)
        arrive()
      })

    return () => {
      cancelled = true
    }
  }, [scene, arrive])

  // Fail-safe. isTransitioning gates every click in the app and only this
  // component clears it, so releasing it on unmount avoids a permanent freeze.
  // Must stay in its own effect — running this on every scene change would
  // cancel the flight lock on the transition it exists to guard.
  useEffect(() => () => useSceneStore.getState().arrive(), [])

  return <CameraControls ref={controls} makeDefault smoothTime={0.8} />
}

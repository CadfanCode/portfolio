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
 * Pin the look constraints for a stop the camera has just arrived at. Called at
 * rest — setOrbitPoint must not run mid-animation.
 */
function applyLookConstraints(c: CameraControlsImpl, stop: CameraStop) {
  if (stop.look === 'firstPerson') {
    // Collapse the orbit pivot to just ahead of the camera. The look direction
    // is unchanged, so framing holds — only the radius the drag swings on shrinks.
    eye.set(...stop.position)
    pivot
      .set(...stop.target)
      .sub(eye)
      .normalize()
      .multiplyScalar(FIRST_PERSON_PIVOT)
      .add(eye)

    c.setOrbitPoint(pivot.x, pivot.y, pivot.z)
  }

  const [minPolar, maxPolar] = stop.polarRange
  c.minPolarAngle = minPolar
  c.maxPolarAngle = maxPolar

  // Azimuth is heading-relative, so it has to be read off the resting pose —
  // after setOrbitPoint, which is the point the angle is measured against.
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

    let cancelled = false
    void c.setLookAt(...stop.position, ...stop.target, animate).then(() => {
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

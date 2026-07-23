import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { MathUtils, Mesh } from 'three'
import type { Group } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { usePointerSelect } from './usePointerSelect'
import { sampleHeight } from './water/waves'
import modelUrl from '../assets/models/maxi77.glb?url'

/**
 * How far, fore-and-aft and athwartships, the buoyancy samples sit from the
 * centre. Roughly the waterline length and beam of the Maxi 77, so the boat
 * pitches and rolls off the slope of the wave under its actual ends rather than
 * a point: a long hull nods less than a cork in the same sea, and this is what
 * gives it that.
 */
const HALF_LENGTH = 3.2
const HALF_BEAM = 1.1

/** Multipliers turning a height difference into an angle, tuned by eye — a boat
 *  does not tilt to the full slope of the wave, it averages it and lags. */
const PITCH_GAIN = 0.55
const ROLL_GAIN = 0.65

/**
 * The Maxi 77, loaded from the generated GLB and floated on the shared waves.
 *
 * No transform on the model itself: it is exported waterline-at-origin, bow at
 * -Z, Y up (see the axis note in `blender/params.py`), which is the scene's own
 * convention, so it drops straight in. The whole boat is one asset — hull, deck,
 * rig, sails and the accommodation — because the camera path passes through the
 * companionway and both halves have to be present at once (see `build.py`).
 *
 * The buoyancy reads the same `waves.ts` the sea surface is displaced by, so the
 * hull sits on the water you can see. Heave is the wave height under the middle;
 * pitch and roll come from the difference between bow and stern, and port and
 * starboard — the boat tilting to the slope it is lying across.
 *
 * The motion eases off to nothing anywhere but the ocean stop. Once the camera
 * is aboard — in the cockpit or below — it is fixed in the world, not tied to
 * the hull, so a rolling boat would slide the whole cabin under a still camera
 * and turn the stomach. A steady boat at those stops reads as a calm mooring and
 * sidesteps that; coupling the camera to the deck is the cleaner fix, and waits
 * for the camera path to be re-authored against this geometry.
 */
export function Boat() {
  const scene = useSceneStore((s) => s.scene)
  const goTo = useSceneStore((s) => s.goTo)
  const { scene: model } = useGLTF(modelUrl)

  const hull = useRef<Group>(null)
  const motion = useRef(0)

  // From the ocean stop the whole boat is the hotspot: click it to come aboard.
  const { bind } = usePointerSelect({
    enabled: scene === 'ocean',
    onSelect: () => goTo('cockpit'),
  })

  // Shadows are opt-in per mesh in three, and the exporter does not set them.
  // Every mesh both casts and receives: the coachroof shadows the side deck, the
  // boom shadows the cabin top, and the hull takes its own rigging's shadow.
  useLayoutEffect(() => {
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }, [model])

  useFrame((state, delta) => {
    const group = hull.current
    if (!group) return

    // Ease the motion in for the ocean stop, out for everywhere else, so coming
    // aboard settles the boat rather than freezing it mid-roll.
    const target = scene === 'ocean' ? 1 : 0
    motion.current = MathUtils.damp(motion.current, target, 3, delta)
    const m = motion.current

    const t = state.clock.elapsedTime
    const midY = sampleHeight(0, 0, t)
    const bow = sampleHeight(0, -HALF_LENGTH, t)
    const stern = sampleHeight(0, HALF_LENGTH, t)
    const port = sampleHeight(-HALF_BEAM, 0, t)
    const starboard = sampleHeight(HALF_BEAM, 0, t)

    group.position.y = midY * m
    // Bow high (bow > stern) pitches the nose up: a negative rotation about +X.
    group.rotation.x = ((stern - bow) / (2 * HALF_LENGTH)) * PITCH_GAIN * m
    // Starboard high rolls the deck to port: a positive rotation about +Z.
    group.rotation.z = ((starboard - port) / (2 * HALF_BEAM)) * ROLL_GAIN * m
    // A slow yaw wander, so a moored boat is never quite dead ahead.
    group.rotation.y = Math.sin(t * 0.13) * 0.02 * m
  })

  return (
    <group ref={hull} {...bind}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(modelUrl)

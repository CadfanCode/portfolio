import { Environment, Lightformer, Sky } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { MathUtils } from 'three'
import type { Group, Vector3Tuple } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { Boat } from './Boat'
import { Cabin } from './Cabin'
import { CabinHatch } from './CabinHatch'
import { CameraRig } from './CameraRig'
import { Ocean } from './Ocean'
import { Exhibits } from './exhibits/Exhibits'
import { sampleHeight } from './water/waves'
import { heelAngle } from './wind'

const SUN: Vector3Tuple = [-38, 14, -48]

// Where the buoyancy samples the sea, fore-and-aft and athwartships — roughly
// the boat's waterline length and beam, so it pitches and rolls off the slope
// under its actual ends rather than a point.
const HALF_LENGTH = 3.2
const HALF_BEAM = 1.1
const PITCH_GAIN = 0.55
const ROLL_GAIN = 0.65

/**
 * The lit, moving world.
 *
 * Motion is carried by two frames rather than by moving the boat alone, which is
 * what lets the rocking read correctly from every stop with a camera that never
 * leaves world space. The boat's would-be motion `M` — heave and pitch and roll
 * off the waves, plus the heel the wind presses on — is split between them by a
 * coupling factor `a` that is 0 out on the ocean and 1 once aboard:
 *
 *  - the boat frame gets `(1 - a)·M`, so from the water you watch the hull rock
 *    and heel against a level horizon;
 *  - the sea frame gets `-a·M`, so once you are aboard the hull holds still and
 *    the horizon rocks and tilts around you instead — which is exactly what
 *    being on a boat looks like, and needs no camera trickery to pull off.
 *
 * Their difference is `M` at every value of `a`, so the boat always sits right
 * on the water; only which of the two you see moving changes as you come aboard.
 * That is also why coming below no longer freezes the boat: the motion does not
 * stop, it moves from the hull to the horizon.
 *
 * Lighting is the cheap, self-contained rig from before — Sky, one shadow sun,
 * and an Environment of local Lightformers for the reflections — and stays in
 * world space: the sun does not roll when the boat does.
 */
export function PortfolioWorld() {
  const scene = useSceneStore((s) => s.scene)

  const boatFrame = useRef<Group>(null)
  const seaFrame = useRef<Group>(null)
  const coupling = useRef(0)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    // Ease between the two frames as you come aboard and back.
    const target = scene === 'ocean' ? 0 : 1
    coupling.current = MathUtils.damp(coupling.current, target, 3, delta)
    const a = coupling.current

    // The boat's motion off the shared sea and wind.
    const heave = sampleHeight(0, 0, t)
    const bow = sampleHeight(0, -HALF_LENGTH, t)
    const stern = sampleHeight(0, HALF_LENGTH, t)
    const port = sampleHeight(-HALF_BEAM, 0, t)
    const starboard = sampleHeight(HALF_BEAM, 0, t)

    const pitch = ((stern - bow) / (2 * HALF_LENGTH)) * PITCH_GAIN
    const roll = ((starboard - port) / (2 * HALF_BEAM)) * ROLL_GAIN + heelAngle(t)
    const yaw = Math.sin(t * 0.13) * 0.02

    const boat = boatFrame.current
    if (boat) {
      boat.position.y = (1 - a) * heave
      boat.rotation.set((1 - a) * pitch, (1 - a) * yaw, (1 - a) * roll)
    }
    const sea = seaFrame.current
    if (sea) {
      sea.position.y = -a * heave
      sea.rotation.set(-a * pitch, -a * yaw, -a * roll)
    }
  })

  return (
    <>
      <CameraRig />

      <Sky
        sunPosition={SUN}
        turbidity={5}
        rayleigh={1.4}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
      />

      <hemisphereLight args={['#cfe3ff', '#1b3038', 0.55]} />

      <directionalLight
        position={SUN}
        intensity={2.6}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-7, 7, 9, -9, 0.1, 80]} />
      </directionalLight>

      <Environment resolution={256}>
        <Lightformer
          form="rect"
          intensity={0.9}
          color="#dcecff"
          position={[0, 12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[40, 40, 1]}
        />
        <Lightformer
          form="ring"
          intensity={5}
          color="#fff1dc"
          position={SUN}
          scale={[6, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.4}
          color="#20455a"
          position={[0, -6, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[40, 40, 1]}
        />
      </Environment>

      {/* The sea rocks when you are aboard; the boat and everything on it rocks
          when you are on the water. See the coupling above. */}
      <group ref={seaFrame}>
        <Ocean />
      </group>
      <group ref={boatFrame}>
        <Boat />
        <Cabin />
        <CabinHatch />
        <Exhibits />
      </group>
    </>
  )
}

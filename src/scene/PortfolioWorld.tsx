import { Environment, Lightformer, Sky } from '@react-three/drei'
import type { Vector3Tuple } from 'three'
import { Boat } from './Boat'
import { Cabin } from './Cabin'
import { CabinHatch } from './CabinHatch'
import { CameraRig } from './CameraRig'
import { Ocean } from './Ocean'
import { Exhibits } from './exhibits/Exhibits'

/**
 * The sun's direction, shared by everything that needs to agree about where the
 * light comes from: the sky's sun disc, the shadow-casting light, and the bright
 * spot in the image-based environment. Low and off the port bow, so the boat is
 * lit across its length rather than flat-on, and the rig throws its shadows down
 * the deck.
 */
const SUN: Vector3Tuple = [-38, 14, -48]

/**
 * The lit world. Lighting is deliberately cheap, per CLAUDE.md — no path tracer,
 * no HDRI fetched over the wire. Three things stand in for baked lighting:
 *
 *  - a `Sky` for the backdrop and the horizon glow;
 *  - one shadow-casting sun for form and a real cast shadow on the water;
 *  - an `Environment` built from local `Lightformer`s, which is the image-based
 *    part: it is what the gelcoat, the chrome and the smoked glass reflect. The
 *    boat's materials were tuned in Blender to read without an environment, but
 *    they read far better with one, and building it from lightformers keeps the
 *    whole scene self-contained — nothing is requested from another host, which
 *    a strict deployment CSP would block anyway.
 */
export function PortfolioWorld() {
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

      {/* Sky-blue from above, sea-dark from below: the ambient the sun does not
          reach, which is most of the shaded side of a white boat. */}
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
        {/* Tight bounds round the boat, so the 2k shadow map spends its
            resolution on the deck rather than on empty sea. */}
        <orthographicCamera attach="shadow-camera" args={[-7, 7, 9, -9, 0.1, 80]} />
      </directionalLight>

      <Environment resolution={256}>
        {/* The sky dome: a large soft source overhead. */}
        <Lightformer
          form="rect"
          intensity={0.9}
          color="#dcecff"
          position={[0, 12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[40, 40, 1]}
        />
        {/* The sun: a small bright disc in its own direction. */}
        <Lightformer
          form="ring"
          intensity={5}
          color="#fff1dc"
          position={SUN}
          scale={[6, 6, 1]}
        />
        {/* The sea: a dim cool source from below, so undersides and the chrome's
            lower half are sea-coloured rather than black. */}
        <Lightformer
          form="rect"
          intensity={0.4}
          color="#20455a"
          position={[0, -6, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[40, 40, 1]}
        />
      </Environment>

      <Ocean />
      <Boat />
      <Cabin />
      <CabinHatch />
      <Exhibits />
    </>
  )
}

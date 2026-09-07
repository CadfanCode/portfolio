import { useMemo, useRef } from 'react'
import { AdditiveBlending, ShaderMaterial } from 'three'

/**
 * The cheap stand-in for a wake: a flat, additive plane trailing a vessel,
 * fading along its length and toward its edges. No simulation — a real wake
 * is a Kelvin pattern of interfering waves, and nothing here needs to be more
 * than a bright V that reads as "something is moving through water" at the
 * distances traffic is seen from. Mounted as a child of the vessel's own
 * group in `Traffic.tsx`, so it inherits the hull's position, heading and
 * wave tilt for free rather than tracking them itself.
 */

/** Metres of wake trailing the stern per metre of hull length — long enough
 *  to read at a glance, short enough not to look like a chalk line. */
const TRAIL_PER_LENGTH = 3.2
/** Wake width per metre of hull length, at the widest point near the stern. */
const WIDTH_PER_LENGTH = 0.22

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    // uv.y runs 0 at the stern to 1 at the tail: fade out with distance so
    // the wake dissolves rather than ending in a hard edge. uv.x runs 0..1
    // across the width: fade toward both edges so it reads as a V of foam,
    // not a solid rectangle.
    float lengthFade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
    float edgeFade = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float a = lengthFade * pow(max(edgeFade, 0.0), 0.6);
    gl_FragColor = vec4(vec3(0.85, 0.92, 0.95), a * 0.35);
  }
`

type WakeProps = {
  /** The vessel's real-world length, metres — sets the wake's own scale so a
   *  ferry drags a far wider wake than a sailboat. */
  lengthM: number
}

export function Wake({ lengthM }: WakeProps) {
  const material = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(() => ({}), [])

  const trail = lengthM * TRAIL_PER_LENGTH
  const width = lengthM * WIDTH_PER_LENGTH

  return (
    // Local +Z is astern (the bow points local -Z, see `normalise.ts`), so
    // the plane sits behind the hull and stretches further astern with it.
    <mesh
      position={[0, 0.02, lengthM * 0.4]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
      frustumCulled={false}
    >
      <planeGeometry args={[width, trail]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  )
}

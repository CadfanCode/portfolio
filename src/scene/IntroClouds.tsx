import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, DoubleSide, ShaderMaterial } from 'three'
import type { Mesh, MeshBasicMaterial } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { CLOUD_BASE, CLOUD_LAYERS, introHaze } from './introFlight'
import { smoothstep } from './mathUtils'

// Shared, so a sheet only exists near its own altitude and the whole deck lets
// go once the camera has dropped below the cloud base — see `introFlight.ts`.
const NEAR_LO = 8
const NEAR_HI = 55
const BAND_LO = CLOUD_BASE - 14
const BAND_HI = CLOUD_BASE + 6

const SHEET_SIZE = 700

// Scratch reused every frame rather than allocated in `useFrame`; the fog
// colour is copied into these rather than the uniform's own `Color` swapped
// out, so there is never a new object in the loop.
const fallbackColor = new Color('#cfdae4')

const sheetVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// The hash/vnoise/fbm trio is the overcast dome's own (`Weather.tsx`), copied
// rather than reimplemented so the punch-through sheets read as the same
// weather as the dome they fall out of.
const sheetFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<4;i++){ v += a*vnoise(p); p*=2.0; a*=0.5; }
    return v;
  }

  void main() {
    // A few scales scrolling at different rates so the deck reads as ragged
    // cloud rather than as a repeating texture.
    vec2 uv = vUv * 6.0;
    float n1 = fbm(uv + vec2(uTime * 0.02, uTime * 0.014));
    float n2 = fbm(uv * 2.1 + vec2(-uTime * 0.01, uTime * 0.008) + 11.0);
    float n3 = fbm(uv * 0.45 + vec2(uTime * 0.006, -uTime * 0.004) - 7.0);
    float n = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    float alpha = smoothstep(0.32, 0.8, n) * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`

type Sheet = {
  mesh: Mesh | null
  material: ShaderMaterial | null
}

/**
 * The cloud deck the opening flight falls through: a handful of horizontal
 * sheets at the heights in `CLOUD_LAYERS`, plus a camera-locked whiteout quad
 * that does the actual hiding of what is beyond them (see `introHaze`'s docs
 * in `introFlight.ts` — the sea's edge is visible from the high waypoints and
 * this quad is what covers it).
 *
 * Renders nothing once the intro is `'done'`, so the deck costs nothing for
 * the rest of the visit.
 */
export function IntroClouds() {
  const intro = useSceneStore((s) => s.intro)
  const scene = useThree((s) => s.scene)

  const sheets = useRef<Sheet[]>(CLOUD_LAYERS.map(() => ({ mesh: null, material: null })))
  const whiteout = useRef<Mesh>(null)
  const whiteoutMaterial = useRef<MeshBasicMaterial>(null)

  const sheetUniforms = useMemo(
    () =>
      CLOUD_LAYERS.map(() => ({
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new Color('#cfdae4') },
      })),
    [],
  )

  useFrame((state) => {
    const camera = state.camera
    const t = state.clock.elapsedTime
    const fogColor = scene.fog?.color ?? fallbackColor

    for (let i = 0; i < CLOUD_LAYERS.length; i++) {
      const layerY = CLOUD_LAYERS[i]
      const sheet = sheets.current[i]
      const mesh = sheet.mesh
      const material = sheet.material
      if (!mesh || !material) continue

      // Keep the sheet centred under the camera every frame so its edge is
      // never in frame — only its own y is fixed, at the layer's height.
      mesh.position.x = camera.position.x
      mesh.position.z = camera.position.z

      const near = 1 - smoothstep(NEAR_LO, NEAR_HI, Math.abs(camera.position.y - layerY))
      const band = smoothstep(BAND_LO, BAND_HI, camera.position.y)

      const u = sheetUniforms[i]
      u.uTime.value = t
      u.uOpacity.value = near * band
      u.uColor.value.copy(fogColor)
    }

    const quad = whiteout.current
    const material = whiteoutMaterial.current
    if (quad && material) {
      quad.position.copy(camera.position)
      quad.quaternion.copy(camera.quaternion)
      quad.translateZ(-0.3)
      material.color.copy(fogColor)
      material.opacity = introHaze(camera.position.y)
    }
  })

  if (intro === 'done') return null

  return (
    <>
      {CLOUD_LAYERS.map((layerY, i) => (
        <mesh
          key={layerY}
          ref={(el) => {
            sheets.current[i].mesh = el
          }}
          position={[0, layerY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          frustumCulled={false}
        >
          <planeGeometry args={[SHEET_SIZE, SHEET_SIZE]} />
          <shaderMaterial
            ref={(el) => {
              sheets.current[i].material = el
            }}
            transparent
            depthWrite={false}
            side={DoubleSide}
            fog={false}
            uniforms={sheetUniforms[i]}
            vertexShader={sheetVertexShader}
            fragmentShader={sheetFragmentShader}
          />
        </mesh>
      ))}

      <mesh ref={whiteout} scale={2} renderOrder={999} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={whiteoutMaterial}
          transparent
          depthTest={false}
          depthWrite={false}
          color="#cfdae4"
        />
      </mesh>
    </>
  )
}

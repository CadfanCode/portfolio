import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Color, ShaderMaterial } from 'three'
import type { Group, LineSegments } from 'three'
import { sampleConditions } from './conditions'

/**
 * The weather you look *at* — the sky's cloud and the rain in the air — as
 * opposed to the sea and sails that carry it lower down. Both read the drift in
 * `conditions.ts`, so they arrive with the same front everything else does: the
 * cloud thickens as the sea gets up, and the rain comes with the squall.
 *
 * Two cheap, self-contained pieces, in keeping with the project's fake-effects
 * rule — no volumetrics, no simulation:
 *
 *  - an overcast dome, one big inward-facing sphere whose shader turns a drifting
 *    noise field into broken cloud that fills in solid as the weather closes;
 *  - rain, a box of falling streaks kept centred on the camera.
 */
export function Weather() {
  return (
    <>
      <OvercastDome />
      <Rain />
    </>
  )
}

/**
 * The sky's cloud, faked as opacity over the drei Sky rather than modelled. A
 * single inward-facing sphere sits between the camera and the Sky; its shader
 * reads a slow fractal noise across the sky and opens it into broken cloud at
 * mid `haze`, then fills it solid — flattening the breaks — as `fogFill` rises
 * toward a real overcast or fog. Coloured with the same fog tone the sea and
 * distance fade into, so the whole sky agrees on what kind of day it is.
 *
 * This is why there is no separate "clouds" object: clear → slightly cloudy →
 * overcast → fogged-in is one continuous knob on one dome, which is both cheaper
 * and more coherent than a herd of billboard puffs that would have to be lit and
 * faded to match anyway.
 */
function OvercastDome() {
  const material = useRef<ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHaze: { value: 0 },
      uFill: { value: 0 },
      uColor: { value: new Color('#c3c8cc') },
    }),
    [],
  )

  useFrame((state) => {
    const m = material.current
    if (!m) return
    const c = sampleConditions(state.clock.elapsedTime)
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uHaze.value = c.haze
    m.uniforms.uFill.value = c.fogFill
    m.uniforms.uColor.value.copy(c.fog)
  })

  return (
    <mesh scale={300} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        side={BackSide}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          precision highp float;
          varying vec3 vDir;
          uniform float uTime;
          uniform float uHaze;   // overall cover, 0..1
          uniform float uFill;   // how solidly the breaks fill in (fog), 0..1
          uniform vec3  uColor;

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
            vec3 dir = normalize(vDir);
            // Project the sky onto a plane overhead so the cloud field spreads to
            // the horizon and bunches with distance, instead of pinching at the
            // zenith. Guarded so it stays finite at and below the horizon.
            float up = max(dir.y, 0.06);
            vec2 uv = dir.xz / up;
            float n = fbm(uv * 0.6 + vec2(uTime * 0.01, uTime * 0.006));

            // Broken cloud: the coverage threshold drops as haze rises, so more of
            // the noise counts as cloud. Fog then lifts the whole thing toward
            // solid, erasing the gaps.
            float clouds = smoothstep(0.85 - uHaze * 0.9, 1.15 - uHaze * 0.5, n + uHaze * 0.35);
            float alpha = mix(clouds, 1.0, uFill) * uHaze;

            // Ease it out at the very horizon so the cloud does not end in a hard
            // ring where the dome meets the sea.
            alpha *= smoothstep(-0.02, 0.12, dir.y);
            alpha = clamp(alpha, 0.0, 0.97);

            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </mesh>
  )
}

const RAIN_COUNT = 1800
const RAIN_BOX = 34 // half-extent of the cube of rain kept around the camera
const RAIN_FALL = 26 // metres per second

/**
 * Rain, as a box of streaks that falls and wraps, kept centred on the camera so
 * it is always around the viewer without ever needing more than a boxful. Each
 * streak's whole life is computed in the vertex shader from a fixed seed and the
 * clock — no per-frame CPU update of the geometry — and the pair only shows when
 * the weather calls for rain, so a clear sky pays nothing for it beyond a hidden
 * draw call.
 */
function Rain() {
  const group = useRef<Group>(null)
  const material = useRef<ShaderMaterial>(null)
  const streaks = useRef<LineSegments>(null)

  // Two vertices per streak: a top and a bottom sharing the streak's seed and
  // origin, the bottom flagged so the shader drops it a streak-length below. The
  // origin rides in the built-in `position` attribute, which also gives three
  // the vertex count and a bounding box for free.
  const geometry = useMemo(() => {
    const count = RAIN_COUNT * 2
    const position = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const end = new Float32Array(count)
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (Math.random() * 2 - 1) * RAIN_BOX
      const y = Math.random() * (RAIN_BOX * 2)
      const z = (Math.random() * 2 - 1) * RAIN_BOX
      const s = Math.random()
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e
        position[v * 3] = x
        position[v * 3 + 1] = y
        position[v * 3 + 2] = z
        seed[v] = s
        end[v] = e // 0 top, 1 bottom
      }
    }
    return { position, seed, end }
  }, [])

  useFrame((state) => {
    const c = sampleConditions(state.clock.elapsedTime)
    const g = group.current
    const m = material.current
    const p = streaks.current
    if (!g || !m || !p) return
    // Nothing to draw when it is dry; skip the streaks entirely.
    p.visible = c.rain > 0.001
    if (!p.visible) return
    // Follow the camera so the box is always around the eye.
    g.position.copy(state.camera.position)
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uRain.value = c.rain
    // A stronger blow drives the rain over at more of a slant.
    m.uniforms.uSlant.value = 0.12 + 0.5 * c.wind
  })

  return (
    <group ref={group}>
      <lineSegments ref={streaks} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[geometry.position, 3]}
          />
          <bufferAttribute attach="attributes-aSeed" args={[geometry.seed, 1]} />
          <bufferAttribute attach="attributes-aEnd" args={[geometry.end, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={material}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uRain: { value: 0 },
            uSlant: { value: 0.2 },
            uFall: { value: RAIN_FALL },
            uBox: { value: RAIN_BOX },
            uLen: { value: 0.6 },
            uColor: { value: new Color('#aab7c4') },
          }}
          vertexShader={/* glsl */ `
            attribute float aSeed;
            attribute float aEnd;
            uniform float uTime;
            uniform float uSlant;
            uniform float uFall;
            uniform float uBox;
            uniform float uLen;
            varying float vEnd;

            void main() {
              vEnd = aEnd;
              float span = uBox * 2.0;
              // Fall and wrap through the box height; the seed spreads the drops
              // out in time so they do not sheet down in a single plane.
              float fall = mod(uTime * uFall + aSeed * span, span);
              vec3 pos = position;
              pos.y = position.y - fall - aEnd * uLen;
              // Slant with the wind, and offset the bottom vertex to draw a
              // streak rather than a point.
              pos.x += aEnd * uLen * uSlant + fall * uSlant * 0.15;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            precision highp float;
            uniform float uRain;
            uniform vec3 uColor;
            varying float vEnd;
            void main() {
              // Fade each streak along its length and with how hard it is raining.
              float a = uRain * 0.5 * (0.25 + 0.75 * vEnd);
              gl_FragColor = vec4(uColor * a, a);
            }
          `}
        />
      </lineSegments>
    </group>
  )
}

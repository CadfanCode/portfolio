import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, ShaderMaterial, Vector2, Vector3 } from 'three'
import { sampleConditions } from '../conditions'
import { worldFrameQuat } from './boatPose'
import { WIND_DIR } from '../wind'

/**
 * The far water: a flat ring that carries the sea from the edge of `Ocean`'s
 * 400x400 Gerstner plane out to the fog. `Ocean` is deliberately small — its
 * vertex shader is the heaviest load in the scene, so it is sized to the water
 * a visitor can actually get close to — but a plane that just stops at 200 m
 * reads as a tabletop the moment the archipelago gives the eye something at the
 * horizon to judge it against. This ring is the cheap fill for everything past
 * that: no displacement, no Gerstner sum, just a colour that agrees with the
 * real sea at the seam and fades into the same fog.
 *
 * Inner radius 190, not 200 and not 285. `Ocean` is a *square* 400x400 plane,
 * so it reaches 200 m along each axis but 282.8 m at its corners (200 * sqrt2).
 * Every point at radius 190 satisfies |x| <= 190 <= 200 and |z| <= 190 <= 200,
 * so it is covered by the square in every direction — the ring's inner edge
 * sits safely under the square everywhere. Any inner radius above 200 would
 * leave a wedge of missing water peeking out along the axes, where the square's
 * edge is closest to the origin. Do not "tidy" this number upward.
 */

/**
 * Dropped 0.25 m below the square plane's y = 0 so the square always wins the
 * depth test where the two overlap — the alternative, coplanar meshes, is a
 * coin-flip z-fight that shimmers as the camera moves. At the ~200 m seam a
 * 0.25 m vertical step subtends under 0.1 degrees, which is well under a pixel
 * and so invisible; it only exists to break the tie.
 */
const RING_Y = -0.25

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldPos = world;

    // One very-low-frequency ripple, aligned to the wind the way the real sea's
    // fine detail is in Ocean.tsx, kept small enough that it only breaks the
    // mirror-flat reflection rather than reading as waves — this surface is
    // never seen up close, so it does not need to move like water, only to stop
    // looking like glass.
    float phase = dot(uWindDir, world.xz) * 0.01 - uTime * 0.06;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    normal.x -= uWindDir.x * 0.02 * cos(phase);
    normal.z -= uWindDir.y * 0.02 * cos(phase);
    vWorldNormal = normalize(normal);

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform float uOvercast;
  uniform float uFogDensity;
  uniform vec3 uFogColor;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // The same sky gradient Ocean.tsx reflects, copied verbatim (see
  // Ocean.tsx:228-237) so the two surfaces read as one continuous sea meeting
  // one continuous sky at the seam.
  vec3 skyColor(vec3 dir) {
    float up = clamp(dir.y, 0.0, 1.0);
    vec3 grad = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.4, up));
    float s = max(dot(dir, uSunDir), 0.0);
    grad += uSunColor * (pow(s, 350.0) * 2.0 + pow(s, 20.0) * 0.4);
    return grad;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);
    vec3 N = normalize(vWorldNormal);

    float NoV = max(dot(N, V), 0.0);
    // Water's real F0 (~0.02), same as Ocean.tsx: near-vertical looks into the
    // body colour, grazing turns to a mirror of the sky.
    float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

    vec3 sky = skyColor(reflect(-V, N));
    // Greyed under cloud, same as Ocean.tsx — an overcast sky has no clean blue
    // to reflect, only the haze the fog is made of.
    sky = mix(sky, uFogColor, uOvercast * 0.75);

    vec3 color = mix(uDeepColor, sky, fres);

    // Fog term copied exactly from Ocean.tsx:393-394. A custom ShaderMaterial
    // gets no automatic three.js fog, so without this the ring would stay a
    // flat colour out to 1600 m and the horizon would be a hard edge instead
    // of dissolving into the same haze as the rest of the scene.
    float fog = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`

// Duplicated from Ocean.tsx rather than imported, same reasoning as that
// file's own SUN_DIR: this is the sun's direction in the world frame's own
// coordinates, turned into a world-space direction each frame via
// worldFrameQuat (see sunWorld below) before it reaches the shader.
const SUN_DIR = new Vector3(-38, 14, -48).normalize()
// Scratch for the world-space sun direction, written each frame so useFrame
// never allocates.
const sunWorld = new Vector3()

export function OceanFar() {
  const material = useRef<ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: sunWorld },
      uSunColor: { value: new Color('#fff1dc') },
      uDeepColor: { value: new Color('#08222c') },
      uSkyHorizon: { value: new Color('#cfd8de') },
      uSkyZenith: { value: new Color('#5b86ad') },
      uOvercast: { value: 0 },
      uFogDensity: { value: 0.0016 },
      uFogColor: { value: new Color('#cfdae4') },
      // A copy, not the shared WIND_DIR, for the same reason Ocean.tsx keeps
      // its own: this is effectively constant, so it never needs setting
      // again, and it should not be an object another module might later
      // start mutating.
      uWindDir: { value: new Vector2(WIND_DIR.x, WIND_DIR.y) },
    }),
    [],
  )

  useFrame((state) => {
    const m = material.current
    if (!m) return
    const t = state.clock.elapsedTime
    const c = sampleConditions(t)
    const u = m.uniforms
    u.uTime.value = t
    sunWorld.copy(SUN_DIR).applyQuaternion(worldFrameQuat)
    u.uOvercast.value = c.overcast
    u.uFogDensity.value = c.fogDensity
    u.uFogColor.value.copy(c.fog)
  })

  return (
    // No pointer handling needed — nothing here is interactive, and skipping
    // raycast on a 1600 m ring saves the same wasted per-move walk Ocean.tsx
    // opts out of for its own plane.
    <mesh
      position={[0, RING_Y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
      frustumCulled={false}
    >
      <ringGeometry args={[190, 1600, 96, 8]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  )
}

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, ShaderMaterial, Vector2, Vector3 } from 'three'
import { DERIVED, WAVES } from './water/waves'

/**
 * The sea: a large plane displaced by the shared Gerstner waves in its own
 * vertex shader, and shaded the cheap way — a Fresnel mix of water colour and a
 * faked sky, with a specular glitter where the sun's reflection lands.
 *
 * A custom shader rather than a lit `MeshStandardMaterial`, on purpose. Real
 * water is mostly reflection and a hard sun glint, neither of which a diffuse
 * PBR material does well or cheaply, and CLAUDE.md asks for the cheap fake over
 * the simulation. The cost of that choice is it takes no cast shadow — which is
 * no loss, because a crisp boat-shaped shadow lying on open water was never
 * right anyway.
 *
 * The waves are `DERIVED` from the very same `waves.ts` the boat floats on, fed
 * in as uniform arrays, so the surface here and the hull's motion cannot drift
 * apart.
 */

const vertexShader = /* glsl */ `
  #define NUM_WAVES ${WAVES.length}
  uniform float uTime;
  uniform vec2  uDir[NUM_WAVES];
  uniform float uK[NUM_WAVES];
  uniform float uOmega[NUM_WAVES];
  uniform float uAmp[NUM_WAVES];
  uniform float uQA[NUM_WAVES];

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 base = world.xz;

    vec3 disp = vec3(0.0);
    // Gerstner normal, accumulated per GPU Gems: start from straight up and bend.
    vec3 normal = vec3(0.0, 1.0, 0.0);

    for (int i = 0; i < NUM_WAVES; i++) {
      float phase = uK[i] * dot(uDir[i], base) - uOmega[i] * uTime;
      float c = cos(phase);
      float s = sin(phase);

      disp.x += uQA[i] * uDir[i].x * c;
      disp.z += uQA[i] * uDir[i].y * c;
      disp.y += uAmp[i] * s;

      float wa = uK[i] * uAmp[i];
      normal.x -= uDir[i].x * wa * c;
      normal.z -= uDir[i].y * wa * c;
      normal.y -= uQA[i] * uK[i] * s;
    }

    vWorldPos = world + disp;
    vWorldNormal = normalize(normal);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // The same gradient the drei <Sky> paints, boiled down to a colour per up-ness
  // of a ray, so the water reflects a sky that matches the one behind it.
  vec3 skyColor(vec3 dir) {
    float up = clamp(dir.y, 0.0, 1.0);
    vec3 grad = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.45, up));
    // The sun's own reflection: a tight, bright road across the water.
    float sun = pow(max(dot(dir, uSunDir), 0.0), 340.0);
    return grad + uSunColor * sun * 0.9;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Schlick Fresnel: glancing water is a mirror, water seen from above is not.
    // The floor is lifted off 0.02 so even the flat water underfoot keeps a
    // little sky in it rather than reading as a black hole in the foreground.
    float f = 0.08 + 0.92 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

    // The body colour: deeper and greener where you look into it, paler where
    // the surface tips towards you.
    vec3 body = mix(uDeepColor, uShallowColor, pow(max(dot(N, V), 0.0), 1.5));

    vec3 reflected = reflect(-V, N);
    vec3 sky = skyColor(reflected);

    // Direct sun sparkle on the ruffled facets, on top of the mirror term.
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 200.0);

    vec3 color = mix(body, sky, f) + uSunColor * spec * 0.6;
    gl_FragColor = vec4(color, 1.0);
  }
`

// Kept in step with PortfolioWorld's SUN by direction; magnitude does not matter
// once normalised. Duplicated rather than imported to keep the sea shader from
// reaching up into the scene graph for one vector.
const SUN_DIR = new Vector3(-38, 14, -48).normalize()

export function Ocean() {
  const material = useRef<ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDir: { value: DERIVED.map((w) => new Vector2(w.dir.x, w.dir.y)) },
      uK: { value: DERIVED.map((w) => w.k) },
      uOmega: { value: DERIVED.map((w) => w.omega) },
      uAmp: { value: DERIVED.map((w) => w.amplitude) },
      uQA: { value: DERIVED.map((w) => w.qa) },
      uSunDir: { value: SUN_DIR },
      uSunColor: { value: new Color('#fff1dc') },
      uDeepColor: { value: new Color('#123742') },
      uShallowColor: { value: new Color('#245663') },
      uSkyHorizon: { value: new Color('#cfd8de') },
      uSkyZenith: { value: new Color('#5b86ad') },
    }),
    [],
  )

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      {/* Big enough to fill the horizon, subdivided finely enough that the
          shortest wave still gets several vertices across its crest. */}
      <planeGeometry args={[400, 400, 240, 240]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  )
}

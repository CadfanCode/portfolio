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

/**
 * The hull's half-beam at the waterline, sampled every 21 cm from stern to bow —
 * measured off the built mesh (a 3 cm slice at z=0 of `maxi77.blend`'s hull,
 * binned along its length), not drawn by hand. This is the outline the sea
 * shader cuts out from under the boat; if the hull is ever re-lofted, re-run the
 * slice and replace the table.
 *
 * World z runs stern (+3.684) to bow (−3.088): the model keeps the waterline at
 * the origin and amidships at z = 0, so the two ends are not symmetric — the
 * stern overhang is longer than the bow's.
 */
const WATERLINE_STERN_Z = 3.684
const WATERLINE_BOW_Z = -3.088
const WATERLINE_HALF_BEAM = [
  0.726, 0.746, 0.767, 0.794, 0.844, 0.856, 0.862, 0.868, 0.868, 0.865, 0.859,
  0.844, 0.831, 0.817, 0.799, 0.778, 0.754, 0.729, 0.664, 0.631, 0.597, 0.567,
  0.531, 0.507, 0.443, 0.411, 0.388, 0.31, 0.287, 0.225, 0.166, 0.11,
]

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
  #define WL_SAMPLES ${WATERLINE_HALF_BEAM.length}
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform float uWaterline[WL_SAMPLES];
  uniform float uWaterlineZ0;
  uniform float uWaterlineZ1;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // The hull's half-beam at the waterline, by world z — a linear walk through
  // the measured table. Zero outside the hull's length, so there is no hole
  // ahead of the stem or abaft the transom.
  float hullHalfBeam(float z) {
    float f = (z - uWaterlineZ0) / (uWaterlineZ1 - uWaterlineZ0);
    if (f <= 0.0 || f >= 1.0) return 0.0;
    float s = f * float(WL_SAMPLES - 1);
    int i = int(floor(s));
    return mix(uWaterline[i], uWaterline[i + 1], fract(s));
  }

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
    // The boat displaces the water it floats in: cut a hull-shaped hole in the
    // sea where the boat sits. Without it the flat sea slices straight through
    // the hull — the cabin sole is below the waterline — and you get waves
    // lapping across the middle of the cabin.
    //
    // The hole is the hull's own waterline outline, measured off the built
    // mesh, not a stand-in shape. It was an ellipse first, and an ellipse is
    // wrong twice over on a boat this shape: too fat amidships left a ring of
    // missing sea round the hull, and too long put a void ahead of the stem
    // where there is no boat at all. Inset a few percent so the cut edge lies
    // just inside the skin and the topsides hide it.
    if (abs(vWorldPos.x) < 0.97 * hullHalfBeam(vWorldPos.z)) discard;

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
      uWaterline: { value: WATERLINE_HALF_BEAM },
      uWaterlineZ0: { value: WATERLINE_STERN_Z },
      uWaterlineZ1: { value: WATERLINE_BOW_Z },
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

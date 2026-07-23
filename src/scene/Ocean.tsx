import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  Color,
  DataTexture,
  LinearFilter,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three'
import { boatWorldInverse } from './water/boatPose'
import {
  SECTION_BOW_Z,
  SECTION_HALF_BEAM,
  SECTION_HEIGHT_MAX,
  SECTION_HEIGHT_MIN,
  SECTION_HEIGHTS,
  SECTION_STATIONS,
  SECTION_STERN_Z,
} from './water/hullSections'
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
 * Metres of half-beam that the section texture's 0…255 range spans. The widest
 * sample is ~1.23 m up at the sheer, so 1.5 leaves headroom while keeping the
 * 8-bit quantisation step under 6 mm — well inside the 3% inset the cut hides
 * behind.
 */
const SECTION_RANGE = 1.5

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
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform mat4 uBoatInverse;
  uniform sampler2D uSections;
  uniform float uSectionRange;
  uniform float uSternZ;
  uniform float uBowZ;
  uniform float uHeightMin;
  uniform float uHeightMax;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // The hull's half-beam at a point given in the hull's own frame: a bilinear
  // fetch from the measured section table, station along z, height along y.
  // Zero anywhere the hull is not — beyond either end, under the bow and stern
  // overhangs, below the canoe body — so the water stays put there.
  float hullHalfBeam(vec3 local) {
    float u = (local.z - uSternZ) / (uBowZ - uSternZ);
    float v = (local.y - uHeightMin) / (uHeightMax - uHeightMin);
    if (u <= 0.0 || u >= 1.0 || v <= 0.0 || v >= 1.0) return 0.0;
    return texture2D(uSections, vec2(u, v)).r * uSectionRange;
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
    // The test is done in the hull's own frame, in 3-D, because two simpler
    // versions both failed visibly. An ellipse left a standing ring of missing
    // sea (too fat amidships, and longer than a stem that is not where an
    // ellipse thinks it is). A world-space waterline outline fixed that for a
    // motionless boat and broke the moment anything moved: the hull heaves,
    // pitches, rolls and heels away from a cut that stays put, and the waves
    // meet the hull at heights where its section is nothing like its waterline
    // — it tucks inward below and flares above. So: transform the displaced
    // fragment into boat space with the same matrix the boat is posed by this
    // frame, and ask the measured section table how wide the hull is at that
    // station *and that height*. The cut follows the boat exactly, by
    // construction, at every point of the motion and the transition between
    // frames. Inset 3% so the edge lies just inside the skin.
    vec3 local = (uBoatInverse * vec4(vWorldPos, 1.0)).xyz;
    float halfBeam = hullHalfBeam(local);
    float edge = abs(local.x) - 0.97 * halfBeam;
    if (halfBeam > 0.0 && edge < 0.0) discard;

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

    // A quiet lap line where the water meets the hull: a slight paling of the
    // sea in the last hand's-width before the skin, breathing slowly along the
    // length. It is what moored water actually does at a boat, and it seats the
    // hull in the sea instead of leaving a knife-edge cut.
    if (halfBeam > 0.0) {
      float lap = 1.0 - smoothstep(0.0, 0.16, edge);
      float breathe = 0.7 + 0.3 * sin(uTime * 1.6 + local.z * 2.3);
      color = mix(color, vec3(0.72, 0.79, 0.82), lap * breathe * 0.22);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`

// Kept in step with PortfolioWorld's SUN by direction; magnitude does not matter
// once normalised. Duplicated rather than imported to keep the sea shader from
// reaching up into the scene graph for one vector.
const SUN_DIR = new Vector3(-38, 14, -48).normalize()

export function Ocean() {
  const material = useRef<ShaderMaterial>(null)

  // The measured hull sections, packed into a small single-channel texture the
  // fragment shader can fetch bilinearly. Built once; the table is generated
  // source (see hullSections.ts) so this never touches the network.
  const sections = useMemo(() => {
    const data = new Uint8Array(SECTION_STATIONS * SECTION_HEIGHTS)
    SECTION_HALF_BEAM.forEach((metres, i) => {
      data[i] = Math.min(255, Math.round((metres / SECTION_RANGE) * 255))
    })
    const texture = new DataTexture(
      data,
      SECTION_STATIONS,
      SECTION_HEIGHTS,
      RedFormat,
      UnsignedByteType,
    )
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.needsUpdate = true
    return texture
  }, [])

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
      // The shared inverse is mutated in place by PortfolioWorld each frame;
      // handing the same object in means it is always current at upload.
      uBoatInverse: { value: boatWorldInverse },
      uSections: { value: sections },
      uSectionRange: { value: SECTION_RANGE },
      uSternZ: { value: SECTION_STERN_Z },
      uBowZ: { value: SECTION_BOW_Z },
      uHeightMin: { value: SECTION_HEIGHT_MIN },
      uHeightMax: { value: SECTION_HEIGHT_MAX },
    }),
    [sections],
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

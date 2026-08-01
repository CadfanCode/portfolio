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
import { useQualityStore } from '../state/useQualityStore'
import { sampleConditions } from './conditions'
import { boatWorldInverse, worldFrameQuat } from './water/boatPose'
import {
  SECTION_BOW_Z,
  SECTION_HALF_BEAM,
  SECTION_HEIGHT_MAX,
  SECTION_HEIGHT_MIN,
  SECTION_HEIGHTS,
  SECTION_STATIONS,
  SECTION_STERN_Z,
} from './water/hullSections'
import { DERIVED, steepScale, WAVES } from './water/waves'
import { WIND_DIR } from './wind'

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
  // The weather scales the reference sea: amplitude for how big, steepness for
  // how peaked. Both come straight from conditions.ts so the drawn sea and the
  // boat's buoyancy (which reads the same scale) cannot part company.
  uniform float uAmpScale;
  uniform float uSteepScale;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  // How hard the crest is folding here, from the Gerstner Jacobian: ~0 on the
  // open swell, ->1 where a steep crest pinches over itself. This is where a
  // real sea throws white water, so the fragment shader breaks foam out of it.
  varying float vFold;
  // The wave's own displaced height above the mean, for the crest translucency.
  varying float vHeight;

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 base = world.xz;

    vec3 disp = vec3(0.0);
    // Gerstner normal, accumulated per GPU Gems: start from straight up and bend.
    vec3 normal = vec3(0.0, 1.0, 0.0);
    // Horizontal Jacobian, identity minus each wave's compression. Where its
    // determinant drops toward zero the surface is folding — a breaking crest.
    float jxx = 1.0;
    float jzz = 1.0;
    float jxz = 0.0;

    for (int i = 0; i < NUM_WAVES; i++) {
      float amp = uAmp[i] * uAmpScale;
      float qa = uQA[i] * uSteepScale * uAmpScale;
      float phase = uK[i] * dot(uDir[i], base) - uOmega[i] * uTime;
      float c = cos(phase);
      float s = sin(phase);

      disp.x += qa * uDir[i].x * c;
      disp.z += qa * uDir[i].y * c;
      disp.y += amp * s;

      float wa = uK[i] * amp;
      normal.x -= uDir[i].x * wa * c;
      normal.z -= uDir[i].y * wa * c;
      normal.y -= qa * uK[i] * s;

      float comp = qa * uK[i] * s;
      jxx -= uDir[i].x * uDir[i].x * comp;
      jzz -= uDir[i].y * uDir[i].y * comp;
      jxz -= uDir[i].x * uDir[i].y * comp;
    }

    float fold = jxx * jzz - jxz * jxz;
    vFold = smoothstep(0.55, -0.15, fold);
    vHeight = disp.y;

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
  // Weather, all from conditions.ts.
  uniform float uWind;       // how hard the wind ripples the fine surface
  uniform float uFoam;       // whitecap amount on the open sea
  uniform float uSpray;      // splash where the sea meets the hull
  uniform float uOvercast;   // how far the sky greys toward the storm
  uniform float uRain;       // rain stipple on the surface
  uniform float uFogDensity; // matches the scene FogExp2
  uniform vec3  uFogColor;
  uniform vec3  uSSSColor;   // colour light glows when it passes through a crest
  uniform vec2  uWindDir;    // the wind's own bearing, world XZ, that the fine ripple fans around

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vFold;
  varying float vHeight;

  #define PI 3.14159265

  // Cheap value noise, for foam breakup and churn — no texture, tiles fine
  // enough for water that is never still.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

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

  // The sky the water reflects: the same gradient the drei <Sky> paints, plus a
  // real sun — a tight hot disc inside a broad warm glow — so the reflection
  // carries an actual sun to shatter into glitter, not a flat wash.
  vec3 skyColor(vec3 dir) {
    float up = clamp(dir.y, 0.0, 1.0);
    vec3 grad = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.4, up));
    float s = max(dot(dir, uSunDir), 0.0);
    // A softer, wider sun than a pinpoint disc: a pinpoint reflected across the
    // ripple is what turns into hard sparkle. The broad glow reads as a warm
    // road on the water and lets the surface specular below carry the glitter.
    grad += uSunColor * (pow(s, 350.0) * 2.0 + pow(s, 20.0) * 0.4);
    return grad;
  }

  // Fine surface detail as slope, not height: a handful of short, fast wavelets
  // criss-crossing the big Gerstner swell. They perturb only the normal, which is
  // exactly what a real sea's wind-ripple does to the light — the mesh is far too
  // coarse to carry ripple this fine, but the normal is what the eye reads, and
  // breaking it up here is what turns a smooth sheet into water and the one sun
  // into a field of glitter. Each wavelet's (dx, dz) is a heading relative to the
  // wind rather than a fixed compass bearing, rotated onto uWindDir below, so the
  // whole fan of ripple turns with the wind instead of sitting still while the sea
  // around it swings. Returns d(height)/d(xz), summed.
  vec2 detailSlope(vec2 p, float t) {
    vec2 g = vec2(0.0);
    #define WAVELET(dx, dz, wl, am, sp) { \
      vec2 o = normalize(vec2(dx, dz)); \
      vec2 d = vec2(o.x * uWindDir.x - o.y * uWindDir.y, o.x * uWindDir.y + o.y * uWindDir.x); \
      float k = 6.2831853 / (wl); \
      float ph = dot(d, p) * k - t * (sp) * k; \
      g += d * (am) * k * cos(ph); \
    }
    WAVELET( 1.0,  0.35, 4.70, 0.016, 0.9)
    WAVELET(-0.75, 1.0,  3.10, 0.012, 1.1)
    WAVELET( 0.45,-1.0,  1.90, 0.008, 1.4)
    WAVELET( 1.0, -0.55, 1.15, 0.005, 1.8)
    WAVELET(-1.0, -0.25, 0.72, 0.0032, 2.2)
    #undef WAVELET
    return g;
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

    vec3 V = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);

    // The surface's own level of detail. A pixel far away, or seen grazing along
    // the water, covers metres of sea; ripple finer than that footprint cannot
    // be drawn without aliasing into the crawling "grid of cubes". So we estimate
    // that footprint — it grows with distance and, hard, as the view flattens
    // toward the horizon — and use it to fade the fine detail out and to roughen
    // the sun highlight, leaving the far and glancing water smooth and fluid and
    // keeping the crisp ripple only where the surface is close enough to hold it.
    float graze = 1.0 - clamp(abs(V.y) * 1.6, 0.0, 1.0);
    float footprint = dist * (0.006 + 0.05 * graze);
    float detailFade = 1.0 / (1.0 + footprint);

    // Build the shading normal: the coarse Gerstner normal off the mesh, tilted
    // by the fine wind-ripple (faded by the footprint). Work in slope space so
    // the two simply add, then rebuild a unit normal.
    vec2 slope = -vWorldNormal.xz / max(vWorldNormal.y, 0.25);
    slope += detailSlope(vWorldPos.xz, uTime) * (0.35 + 0.9 * uWind) * detailFade;
    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

    float NoV = max(dot(N, V), 0.0);

    // Fresnel with water's real F0 (~0.02): looking straight down you see into
    // the water; at a glancing angle it turns to a mirror of the sky.
    float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

    // Body colour: deep teal looking into it, a paler green-blue where the face
    // tips toward you.
    vec3 body = mix(uDeepColor, uShallowColor, pow(NoV, 1.4));

    // Translucency — the sea's signature. Light driven through a thin, backlit
    // crest scatters out green: strongest on the high crests with the sun on the
    // far side of the wave from the eye, and killed under an overcast that has no
    // sun to drive it.
    float back = pow(max(dot(V, -uSunDir), 0.0), 3.0);
    float crest = smoothstep(0.0, 0.55, vHeight + 0.08);
    vec3 sss = uSSSColor * back * crest * (1.0 - uOvercast) * 1.2;

    // Sky reflection, greyed under cloud — the same haze the fog is made of.
    vec3 sky = skyColor(reflect(-V, N));
    sky = mix(sky, uFogColor, uOvercast * 0.75);

    // Sun glitter: a GGX highlight against the ripple-broken normal, so the one
    // sun spreads into a soft field of moving sparkle. The roughness widens with
    // the footprint (geometric specular antialiasing), which is what stops the
    // highlight from resolving into hard crawling cubes at distance.
    vec3 Hh = normalize(V + uSunDir);
    float NoH = max(dot(N, Hh), 0.0);
    float rough = clamp(0.07 + footprint * 0.6, 0.07, 0.42);
    float a2 = rough * rough; a2 *= a2;
    float dnm = NoH * NoH * (a2 - 1.0) + 1.0;
    float glint = (a2 / (PI * dnm * dnm)) * fres * (1.0 - uOvercast);

    vec3 color = mix(body + sss, sky, fres) + uSunColor * min(glint, 3.5);

    // Whitecaps: white water broken out of the folding crests the vertex shader
    // flagged, gated by the weather's foam level so a calm sea stays unbroken
    // and only a real blow turns the tops over. A little noise stops it reading
    // as a clean painted line along each crest.
    if (uFoam > 0.0) {
      float churn = 0.55 + 0.45 * vnoise(vWorldPos.xz * 0.9 + uTime * vec2(0.15, -0.1));
      float caps = clamp(vFold * uFoam * churn * 1.6, 0.0, 1.0);
      color = mix(color, vec3(0.92, 0.95, 0.96), smoothstep(0.12, 0.6, caps));
    }

    // Where the sea meets the hull. In a calm this is the old quiet lap line — a
    // slight paling breathing along the waterline. As the sea gets up it becomes
    // a wash of broken water surging against the topsides: the collar widens,
    // churns on its own noise, and pulses as if each wave were slapping the
    // side. That surge is the "splashing against the boat" the scene needs, done
    // in the shader off the same hull-distance field the cut already computes.
    if (halfBeam > 0.0) {
      float width = 0.14 + 0.16 * uSpray;
      float band = 1.0 - smoothstep(0.0, width, edge);
      float churn = vnoise(local.xz * vec2(2.4, 3.2) + uTime * vec2(0.7, -0.5));
      float breathe = 0.65 + 0.35 * sin(uTime * 1.6 + local.z * 2.3);
      float slap = 0.6 + 0.4 * sin(uTime * 3.4 + local.z * 3.1);
      float wash = band * mix(breathe, (0.4 + 0.6 * churn) * slap, uSpray);
      float amt = mix(0.22, 0.85, uSpray) * wash;
      color = mix(color, vec3(0.92, 0.95, 0.97), clamp(amt, 0.0, 1.0));
    }

    // Rain stippling the surface — a scatter of bright dimples where drops
    // strike, stepped in time so they flicker rather than crawl.
    if (uRain > 0.0) {
      float cell = vnoise(vWorldPos.xz * 7.0 + floor(uTime * 11.0));
      color += vec3(0.06) * uRain * step(0.82, cell);
    }

    // Aerial perspective / fog, matched to the scene's FogExp2 so the sea's
    // horizon dissolves into the same haze the sky and boat do. dist is the
    // camera distance computed up in the lighting section.
    float fog = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`

// Kept in step with PortfolioWorld's SUN by direction; magnitude does not matter
// once normalised. Duplicated rather than imported to keep the sea shader from
// reaching up into the scene graph for one vector. This is the sun's direction
// *in the world frame's own coordinates* — the sea, sky, cloud and sun all ride
// inside one rotating world frame, so it is turned into an actual world-space
// direction each frame by that frame's rotation (see sunWorld, below) before it
// reaches the shader.
const SUN_DIR = new Vector3(-38, 14, -48).normalize()
// Scratch for the world-space sun direction, written each frame; allocated once
// so useFrame never allocates.
const sunWorld = new Vector3()

export function Ocean() {
  const material = useRef<ShaderMaterial>(null)
  // The single biggest vertex-shader load in the scene: at 240 this plane is
  // 115,200 triangles, each one running the three-iteration Gerstner sum and its
  // Jacobian. Resolved once at startup and fixed for the session, so the
  // geometry is built once and never rebuilt. See `quality.ts` for why the lower
  // tiers cannot go much below this before the shortest wave disappears.
  const segments = useQualityStore((s) => s.settings.ocean.segments)

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
      uSunDir: { value: sunWorld },
      uSunColor: { value: new Color('#fff1dc') },
      uDeepColor: { value: new Color('#08222c') },
      uShallowColor: { value: new Color('#1b5866') },
      uSkyHorizon: { value: new Color('#cfd8de') },
      uSkyZenith: { value: new Color('#5b86ad') },
      uSSSColor: { value: new Color('#1f7d63') },
      // The shared inverse is mutated in place by PortfolioWorld each frame;
      // handing the same object in means it is always current at upload.
      uBoatInverse: { value: boatWorldInverse },
      uSections: { value: sections },
      uSectionRange: { value: SECTION_RANGE },
      uSternZ: { value: SECTION_STERN_Z },
      uBowZ: { value: SECTION_BOW_Z },
      uHeightMin: { value: SECTION_HEIGHT_MIN },
      uHeightMax: { value: SECTION_HEIGHT_MAX },
      // Weather, driven each frame from conditions.ts.
      uAmpScale: { value: 1 },
      uSteepScale: { value: 1 },
      uWind: { value: 0.3 },
      uFoam: { value: 0 },
      uSpray: { value: 0 },
      uOvercast: { value: 0 },
      uRain: { value: 0 },
      uFogDensity: { value: 0.0016 },
      uFogColor: { value: new Color('#cfdae4') },
      // A copy, not the shared WIND_DIR — this is effectively constant, so it
      // never needs setting again, but it should not be the same object another
      // module might later start mutating.
      uWindDir: { value: new Vector2(WIND_DIR.x, WIND_DIR.y) },
    }),
    [sections],
  )

  useFrame((state) => {
    const m = material.current
    if (!m) return
    const t = state.clock.elapsedTime
    const c = sampleConditions(t)
    const u = m.uniforms
    u.uTime.value = t
    // The frame-local sun turned into world space by the frame's own rotation
    // this frame — see the comment on SUN_DIR — so the glitter road points at
    // the sun the sky is actually showing, heel and all.
    sunWorld.copy(SUN_DIR).applyQuaternion(worldFrameQuat)
    u.uAmpScale.value = c.seaAmp
    // Not the raw c.seaChop: amplitude and chop together ask for roughly twice
    // what Gerstner can draw in a squall (Σ Q·A·k ≈ 2 against a folding limit
    // of 1), which turned the crests inside out and sloshed them sideways.
    // steepScale eases that demand onto the limit instead of overshooting it.
    u.uSteepScale.value = steepScale(c.seaAmp, c.seaChop)
    u.uWind.value = c.wind
    u.uFoam.value = c.foam
    u.uSpray.value = c.spray
    u.uOvercast.value = c.overcast
    u.uRain.value = c.rain
    u.uFogDensity.value = c.fogDensity
    u.uFogColor.value.copy(c.fog)
  })

  return (
    // Nothing binds a pointer handler to the ocean, so let R3F skip raycasting
    // it entirely. `Mesh.raycast` would otherwise walk all 115,200 triangles of
    // this plane on every pointer move with no early-out — the camera sits
    // inside its bounding sphere — and that work lands on the main thread
    // during camera drags, where it reads as input lag.
    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      {/* Big enough to fill the horizon, subdivided finely enough that the
          shortest wave still gets several vertices across its crest — how finely
          is the quality tier's call. */}
      <planeGeometry args={[400, 400, segments, segments]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  )
}

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Mesh, Object3D, Vector3, Vector4 } from 'three'
import type { Material, WebGLProgramParametersWithUniforms } from 'three'
import { useSceneStore } from '../state/useSceneStore'
import { sampleConditions } from './conditions'
import { clamp01, smoothstep } from './mathUtils'
import { usePointerSelect } from './usePointerSelect'
import { windStrength } from './wind'
import modelUrl from '../assets/models/maxi77.glb?url'

/** The two cloth sails — the meshes that get the full cloth shader. */
const SAIL_MESHES = new Set(['mainsail', 'genoa'])

/**
 * Sail furniture sewn to the mainsail: the number, the battens and the
 * headboard. These have to ride the same displacement field as the cloth or
 * they detach the moment the sail moves — a number floating off the belly, a
 * batten hanging in space. They get the same vertex code, driven from the
 * mainsail's own frame, on their own cloned materials.
 */
const MAIN_FURNITURE = new Set(['sail_number', 'mainsail_battens', 'mainsail_headboard'])

type PatchedMaterial = Material & {
  userData: { shader?: WebGLProgramParametersWithUniforms }
}

/** A length of spar or wire the cloth cannot pass through, in a sail's own
 *  local space: a capsule from A to B of radius R. */
type Capsule = { A: Vector3; B: Vector3; R: number }

/** Where a sail sits in its own local space: the height range and the luff and
 *  leech lines (as z at foot and head), so the shader can place any vertex on a
 *  chord/height grid however the triangle tapers. */
type SailFrame = { footY: number; headY: number; edges: Vector4 }

// --------------------------------------------------------------------------
// The cloth shader — injected into the standard sail material's vertex stage.
//
// Three motions along the sail's own normal, each anchored where a real sail
// works, plus a rig-collision pass so the cloth drapes against the spreader and
// shrouds instead of the rig spearing through it. In keeping with the project's
// rule of faking cheap effects over simulating — this is a vertex displacement,
// not a cloth solver — but anchored hard enough to the real edges and the real
// rig that it reads as a sail working rather than a sheet rippling.
// --------------------------------------------------------------------------

const COMMON_CHUNK = /* glsl */ `#include <common>
  uniform float uTime;
  uniform float uPower;   // steady press of the wind — how deep the belly breathes
  uniform float uLuff;    // leading edge working — rises with the weather
  uniform float uFlutter; // leech shiver — the trailing edge working in a blow
  uniform float uGust;    // the fast gust, a little of it across the whole sail
  uniform float uSea;     // master liveliness, 0 calm … 1 squall — scales all motion
  uniform float uFootY;
  uniform float uHeadY;
  uniform vec4  uEdges;   // (luffZ@foot, leechZ@foot, luffZ@head, leechZ@head)
  uniform vec3  uCapA[4];
  uniform vec3  uCapB[4];
  uniform float uCapR[4];
  uniform int   uCapN;

  const float SAIL_PI = 3.141592653589793;

  // The displacement, in metres along the sail's normal, as a function of
  // chordwise u (0 luff .. 1 leech) and vertical v (0 foot .. 1 head). Written
  // as one function so the shading normal can be tilted by its own slope,
  // finite-differenced below — which is what makes the ripples catch the light.
  float sailField(float u, float v) {
    // 1. Belly: the whole sail breathing as it loads and eases. Zero at every
    //    edge, deepest amidships, deeper the harder the wind presses.
    float belly = sin(SAIL_PI * u) * sin(SAIL_PI * v);
    float breathe = 0.5 * sin(v * 2.0 + uTime * 0.8) + 0.5 * sin(u * 2.5 - uTime * 0.6);
    float d = belly * breathe * (0.006 + 0.014 * uPower);

    // 2. Luff working: a wave that enters at the leading edge and rolls aft,
    //    dying before the leech. Held off the head, but now free right down to
    //    the foot, so the lower luff works too. Rises with the weather.
    float luffMask = smoothstep(0.55, 0.0, u)
                   * smoothstep(0.02, 0.16, v) * smoothstep(1.0, 0.72, v);
    float luffWave = sin(u * 7.0 - uTime * 7.0 + v * 2.0)
                   + 0.5 * sin(u * 12.0 - uTime * 11.0 - v * 1.4);
    d += luffMask * luffWave * (0.008 + 0.045 * uLuff);

    // 3. Leech flutter: the trailing edge and the upper leech shivering —
    //    fastest and finest of the three, loudest in a blow or a spray-throwing
    //    chop, where a real leech buzzes.
    float leechMask = smoothstep(0.62, 1.0, u) * smoothstep(0.08, 0.9, v);
    float leechWave = sin(v * 9.0 - uTime * 16.0 + u * 4.0)
                    + 0.6 * sin(v * 17.0 - uTime * 23.0 - u * 3.0);
    d += leechMask * leechWave * (0.005 + 0.030 * uFlutter);

    // 4. Foot: the bottom edge lifting and working. Pinned only at the two foot
    //    corners — the tack (u=0) and the clew (u=1) — via sin(pi*u), and fading
    //    up the sail, so the loose foot of the main and the free foot of the
    //    genoa both move instead of hanging dead. Grows hard with the sea.
    float footMask = sin(SAIL_PI * u) * smoothstep(0.30, 0.03, v);
    float footWave = sin(u * 4.0 + uTime * 5.0)
                   + 0.5 * sin(u * 8.0 - uTime * 7.3 + 1.0);
    d += footMask * footWave * (0.010 + 0.055 * uSea);

    // 5. A little of the gust across the whole sail, so it never sits perfectly
    //    still between the slower motions above.
    d += belly * sin(v * 3.0 + u * 2.0 - uTime * 3.0) * 0.004 * uGust;

    // 6. Strain: near the top of the range the whole cloth trembles under load —
    //    a fine, full-surface vibration for a sail pressed hard in a squall, gone
    //    entirely below a real blow. Kept low in amplitude and spatial frequency
    //    on purpose: wind it up and the registration (which rides this same
    //    field, mid-sail) warps and its two printed faces begin to show through
    //    each other. This shimmers the cloth without shredding the number.
    float strain = smoothstep(0.62, 1.0, uSea);
    d += (sin(u * 12.0 + v * 15.0 - uTime * 29.0)
        + 0.7 * sin(u * 9.0 - v * 12.0 - uTime * 24.0)) * 0.0032 * strain;

    // Master liveliness: quiet in a calm, thrashing in a squall. The sail keeps
    // the fullness baked into its geometry; this scales the life on top of it,
    // so calm seas stir it a little and rough seas throw it about.
    return d * (0.18 + 0.82 * uSea);
  }
`

// Place the vertex on the sail and tilt the shading normal by the field's
// slope, before the normal is transformed. Declares sailD/sailU/sailV/etc. into
// main()'s scope so the displacement pass below can reuse them.
const BEGINNORMAL_CHUNK = /* glsl */ `#include <beginnormal_vertex>
  float sailV = clamp((position.y - uFootY) / max(uHeadY - uFootY, 1e-3), 0.0, 1.0);
  float sailLuffZ  = mix(uEdges.x, uEdges.z, sailV);
  float sailLeechZ = mix(uEdges.y, uEdges.w, sailV);
  float sailChord = max(sailLeechZ - sailLuffZ, 1e-3);
  float sailU = clamp((position.z - sailLuffZ) / sailChord, 0.0, 1.0);

  float sailHeightSpan = max(uHeadY - uFootY, 1e-3);
  float sailD = sailField(sailU, sailV);
  float sailE = 0.02;
  float sailDdu = (sailField(sailU + sailE, sailV) - sailD) / sailE;
  float sailDdv = (sailField(sailU, sailV + sailE) - sailD) / sailE;
  // u runs along z over sailChord metres, v along y over sailHeightSpan, so the
  // slope in metres-per-metre is the field slope over those spans. Tilt the
  // normal against it.
  objectNormal = normalize(objectNormal
    - (sailDdu / sailChord)      * vec3(0.0, 0.0, 1.0)
    - (sailDdv / sailHeightSpan) * vec3(0.0, 1.0, 0.0));
`

const BEGINVERTEX_CHUNK = /* glsl */ `#include <begin_vertex>
  // Push the cloth out along its own (undisturbed) normal by the field above.
  transformed += normal * sailD;

  // Then let the rig hold it. Each capsule is a length of spar or wire the cloth
  // cannot pass through; a vertex that has ended up inside one is pushed
  // radially back out to its surface. That clears the leeward spreader and
  // shrouds that used to spear through the sail; the spreader capsule is drawn
  // a little fatter than the spar (see worldCapsules), so the genoa stands off
  // its tip by a small gap rather than bearing on it.
  for (int i = 0; i < 4; i++) {
    if (i >= uCapN) break;
    vec3 ab = uCapB[i] - uCapA[i];
    float tt = clamp(dot(transformed - uCapA[i], ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec3 c = uCapA[i] + ab * tt;
    vec3 w = transformed - c;
    float dist = length(w);
    if (dist < uCapR[i]) {
      transformed += (w / max(dist, 1e-4)) * (uCapR[i] - dist);
    }
  }
`

// --------------------------------------------------------------------------
// Reading the model: the sail's own frame, and the rig it drapes against.
// --------------------------------------------------------------------------

function findMesh(root: Object3D, name: string): Mesh | null {
  let found: Mesh | null = null
  root.traverse((o) => {
    if (!found && o instanceof Mesh && o.name === name) found = o
  })
  return found
}

/** Where a sail sits in its own local space, read off its geometry.
 *
 * The luff (min z at a height) and leech (max z) are sampled in a low band and a
 * high band and the line through the two is extrapolated to the foot and head,
 * so the shader gets the real tapering edges rather than a bounding box — a
 * triangle's chord runs out to nothing at the head. */
function sailFrame(mesh: Mesh): SailFrame {
  const p = mesh.geometry.attributes.position
  let footY = Infinity
  let headY = -Infinity
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y < footY) footY = y
    if (y > headY) headY = y
  }
  const span = Math.max(headY - footY, 1e-3)

  let loN = 0
  let loV = 0
  let loLuff = Infinity
  let loLeech = -Infinity
  let hiN = 0
  let hiV = 0
  let hiLuff = Infinity
  let hiLeech = -Infinity
  for (let i = 0; i < p.count; i++) {
    const v = (p.getY(i) - footY) / span
    const z = p.getZ(i)
    if (v >= 0.05 && v <= 0.25) {
      loN++
      loV += v
      loLuff = Math.min(loLuff, z)
      loLeech = Math.max(loLeech, z)
    } else if (v >= 0.7 && v <= 0.9) {
      hiN++
      hiV += v
      hiLuff = Math.min(hiLuff, z)
      hiLeech = Math.max(hiLeech, z)
    }
  }

  // Degenerate fallback: a sail with no vertices in a band gets flat edges.
  if (loN === 0 || hiN === 0) {
    let luff = Infinity
    let leech = -Infinity
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      luff = Math.min(luff, z)
      leech = Math.max(leech, z)
    }
    return { footY, headY, edges: new Vector4(luff, leech, luff, leech) }
  }

  const vLo = loV / loN
  const vHi = hiV / hiN
  const at = (lo: number, hi: number, target: number) =>
    lo + ((hi - lo) * (target - vLo)) / (vHi - vLo)
  return {
    footY,
    headY,
    edges: new Vector4(
      at(loLuff, hiLuff, 0),
      at(loLeech, hiLeech, 0),
      at(loLuff, hiLuff, 1),
      at(loLeech, hiLeech, 1),
    ),
  }
}

/** Which side the sails are set to: +1 starboard, -1 port. Kept in step with
 *  `LEEWARD_SIGN` in `blender/params.py`, which bellies the baked cloth to this
 *  side — the rig it drapes against is the leeward spreader and shroud, so this
 *  picks which of the two spreaders to guard it from. */
const LEEWARD_SIGN = 1

/** The rig points the sails drape against, in world space. */
type RigAnchors = {
  leeSpreaderTip: Vector3
  leeSpreaderRoot: Vector3
  masthead: Vector3
  mastHeel: Vector3
}

function rigAnchors(root: Object3D): RigAnchors | null {
  const spreaders = findMesh(root, 'spreaders')
  const mast = findMesh(root, 'mast')
  if (!spreaders || !mast) return null

  const v = new Vector3()

  // The leeward spreader: its tip (furthest outboard on the leeward side) and
  // its root (the leeward-side vertex nearest the centreline). "Outboard" is
  // whichever direction LEEWARD_SIGN points, so a flipped tack picks the other
  // spreader with no other change here.
  const leeSpreaderTip = new Vector3()
  const leeSpreaderRoot = new Vector3()
  let tipX = -Infinity
  let rootX = Infinity
  const sp = spreaders.geometry.attributes.position
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i).applyMatrix4(spreaders.matrixWorld)
    const lee = LEEWARD_SIGN * v.x
    if (lee > tipX) {
      tipX = lee
      leeSpreaderTip.copy(v)
    }
    if (lee > 0 && lee < rootX) {
      rootX = lee
      leeSpreaderRoot.copy(v)
    }
  }

  // The mast: heel (lowest) and masthead (highest).
  const masthead = new Vector3()
  const mastHeel = new Vector3()
  let lowY = Infinity
  let highY = -Infinity
  const mp = mast.geometry.attributes.position
  for (let i = 0; i < mp.count; i++) {
    v.fromBufferAttribute(mp, i).applyMatrix4(mast.matrixWorld)
    if (v.y < lowY) {
      lowY = v.y
      mastHeel.copy(v)
    }
    if (v.y > highY) {
      highY = v.y
      masthead.copy(v)
    }
  }

  return { leeSpreaderTip, leeSpreaderRoot, masthead, mastHeel }
}

/** The capsules a given sail drapes against, in world space. */
function worldCapsules(name: string, rig: RigAnchors): Capsule[] {
  const { leeSpreaderTip, leeSpreaderRoot, masthead, mastHeel } = rig
  // The leeward spreader, and the upper shroud running from its tip up to the
  // masthead — the two lengths of rig that cross the upper sail on the leeward
  // side and used to show through it. The genoa gets a fatter spreader capsule
  // (below) so it stands off the tip with a small gap; the mainsail, aft of the
  // spar, only needs it kept from spearing through.
  const spreaderR = name === 'genoa' ? 0.11 : 0.06
  const caps: Capsule[] = [
    { A: leeSpreaderRoot.clone(), B: leeSpreaderTip.clone(), R: spreaderR },
    { A: leeSpreaderTip.clone(), B: masthead.clone(), R: 0.03 },
  ]
  if (name === 'genoa') {
    // The overlapping genoa also sweeps across the mast below the hounds. Guard
    // the mast up to spreader height only: the genoa's own head lands at the
    // masthead, so it belongs against the mast up there and must not be pushed
    // off it.
    const mastMid = mastHeel.clone().lerp(masthead, 0.52)
    caps.push({ A: mastHeel.clone(), B: mastMid, R: 0.1 })
  }
  return caps
}

/** Bring world-space capsules into a target mesh's local space (where the
 *  vertex shader's `transformed` lives). */
function toLocal(mesh: Mesh, caps: Capsule[]): Capsule[] {
  const inv = mesh.matrixWorld.clone().invert()
  return caps.map((c) => ({
    A: c.A.clone().applyMatrix4(inv),
    B: c.B.clone().applyMatrix4(inv),
    R: c.R,
  }))
}

/** Pad a capsule list to the fixed length the shader loop expects. */
function padVec(caps: Capsule[], key: 'A' | 'B'): Vector3[] {
  const out: Vector3[] = []
  for (let i = 0; i < 4; i++) out.push(caps[i] ? caps[i][key] : new Vector3())
  return out
}

function padR(caps: Capsule[]): number[] {
  const out: number[] = []
  for (let i = 0; i < 4; i++) out.push(caps[i] ? caps[i].R : 0)
  return out
}

/**
 * The Maxi 77, loaded from the generated GLB.
 *
 * No transform on the model: it is exported waterline-at-origin, bow at -Z, Y up
 * (see the axis note in `blender/params.py`), so it drops straight in. It sits
 * inside the scene's boat frame, which is what heaves, pitches, rolls and heels
 * it — see `PortfolioWorld`. This component loads it, turns shadows on, and
 * gives the sails life.
 *
 * The sails react to the weather by a vertex displacement, not a cloth sim (see
 * the shader chunks above): a pressure-driven belly, a working luff, a fluttering
 * leech and a lifting foot, all driven from the same `sampleConditions` and
 * `windStrength` the boat heels to, so the sail works with the wind the hull
 * leans on rather than to a rhythm of its own. Their liveliness tracks the sea
 * state — barely a stir in a calm, thrown about in a rough sea, thrashing and
 * strained in a squall. Each sail carries its own material clone so it can be
 * given its own edges and its own length of rig to drape against — the leeward
 * spreader and shrouds no longer spear through the cloth.
 */
export function Boat() {
  const scene = useSceneStore((s) => s.scene)
  const goTo = useSceneStore((s) => s.goTo)
  const { scene: model } = useGLTF(modelUrl)

  // Every patched sail/furniture shader, driven together each frame.
  const shaders = useRef<WebGLProgramParametersWithUniforms[]>([])

  // From the ocean stop the whole boat is the hotspot: click it to come aboard.
  const { bind } = usePointerSelect({
    enabled: scene === 'ocean',
    onSelect: () => goTo('cockpit'),
  })

  useLayoutEffect(() => {
    shaders.current = []
    model.updateMatrixWorld(true)

    const rig = rigAnchors(model)
    const mainMesh = findMesh(model, 'mainsail')
    const mainFrame = mainMesh ? sailFrame(mainMesh) : null
    const mainWorldCaps = rig ? worldCapsules('mainsail', rig) : []

    const register = (shader: WebGLProgramParametersWithUniforms) => {
      shaders.current.push(shader)
    }

    const patch = (mesh: Mesh, frame: SailFrame, caps: Capsule[]) => {
      if (Array.isArray(mesh.material)) return
      const material = (mesh.material as Material).clone() as PatchedMaterial
      mesh.material = material
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 }
        shader.uniforms.uPower = { value: 0.5 }
        shader.uniforms.uLuff = { value: 0.3 }
        shader.uniforms.uFlutter = { value: 0.3 }
        shader.uniforms.uGust = { value: 0.5 }
        shader.uniforms.uSea = { value: 0.3 }
        shader.uniforms.uFootY = { value: frame.footY }
        shader.uniforms.uHeadY = { value: frame.headY }
        shader.uniforms.uEdges = { value: frame.edges.clone() }
        shader.uniforms.uCapA = { value: padVec(caps, 'A') }
        shader.uniforms.uCapB = { value: padVec(caps, 'B') }
        shader.uniforms.uCapR = { value: padR(caps) }
        shader.uniforms.uCapN = { value: Math.min(caps.length, 4) }
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', COMMON_CHUNK)
          .replace('#include <beginnormal_vertex>', BEGINNORMAL_CHUNK)
          .replace('#include <begin_vertex>', BEGINVERTEX_CHUNK)
        material.userData.shader = shader
        register(shader)
      }
      material.needsUpdate = true
    }

    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      // Shadows are opt-in per mesh in three, and the exporter does not set them.
      object.castShadow = true
      object.receiveShadow = true

      if (SAIL_MESHES.has(object.name)) {
        const frame = sailFrame(object)
        const caps = rig ? toLocal(object, worldCapsules(object.name, rig)) : []
        patch(object, frame, caps)
      } else if (MAIN_FURNITURE.has(object.name) && mainFrame) {
        // The mainsail's number, battens and headboard ride the mainsail's own
        // field and drape against the same rig, so they stay glued to the cloth.
        const caps = rig ? toLocal(object, mainWorldCaps) : []
        patch(object, mainFrame, caps)
      }
    })
  }, [model])

  useFrame((state) => {
    if (shaders.current.length === 0) return
    const t = state.clock.elapsedTime
    const c = sampleConditions(t)
    const gust = windStrength(t)

    // The motions read straight off the weather so the sail agrees with the sea
    // and the heel, and — as asked — its liveliness tracks the conditions: a
    // glassy calm barely stirs it, a rough sea throws it about, and a squall has
    // it thrashing and trembling under the strain. `intensity` is that one axis,
    // leaning on the sea state with the wind behind it; every motion scales with
    // it (the master term in `sailField`), and the belly still bellies out under
    // the steady press.
    const intensity = clamp01(0.6 * c.sea + 0.4 * c.wind)
    const power = c.wind
    // Leading edge and leech both rise with the weather now, the leech extra
    // alive in a real blow or a spray-throwing chop where a real one buzzes.
    const luff = clamp01(0.12 + 0.85 * intensity)
    const flutter = clamp01(
      0.1 + 0.45 * intensity + 0.4 * c.spray + 0.35 * smoothstep(0.6, 1, c.wind),
    )

    for (const shader of shaders.current) {
      shader.uniforms.uTime.value = t
      shader.uniforms.uPower.value = power
      shader.uniforms.uLuff.value = luff
      shader.uniforms.uFlutter.value = flutter
      shader.uniforms.uGust.value = gust
      shader.uniforms.uSea.value = intensity
    }
  })

  return (
    <group {...bind}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(modelUrl)

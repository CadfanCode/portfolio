import { Environment, Sky } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { ComponentRef } from 'react'
import { Euler, MathUtils, Vector3 } from 'three'
import type {
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Vector3Tuple,
} from 'three'
import { boatWorldInverse, worldFrameQuat } from './water/boatPose'
import { useQualityStore } from '../state/useQualityStore'
import { useSceneStore } from '../state/useSceneStore'
import { Boat } from './Boat'
import { BookSpines } from './BookSpines'
import { Cabin } from './Cabin'
import { CabinHatch } from './CabinHatch'
import { CabinPictures } from './CabinPictures'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'
import { EnvSky } from './EnvSky'
import { FocusQuality } from './FocusQuality'
import { FocusTargets } from './FocusTargets'
import { IntroClouds } from './IntroClouds'
import { IntroTitle } from './IntroTitle'
import { Ocean } from './Ocean'
import { ParrotAssistant } from '../parrot'
import { QualityMonitor } from './QualityMonitor'
import { Soundscape } from './Soundscape'
import { Weather } from './Weather'
import { sampleConditions } from './conditions'
import { Exhibits } from './exhibits/Exhibits'
import { sampleHullPlane } from './water/waves'
import type { HullPlane } from './water/waves'
import { heelAngle } from './wind'

const SUN: Vector3Tuple = [-38, 14, -48]

// The footprint the buoyancy weighs the sea over — roughly the boat's waterline
// length and beam, so it floats on the water it actually covers rather than on
// the height at a point. See `sampleHullPlane`.
const HALF_LENGTH = 3.2
const HALF_BEAM = 1.1
const PITCH_GAIN = 0.55
const ROLL_GAIN = 0.65

// Scratch for the fitted sea plane, reused so the per-frame fit allocates nothing.
const hullPlane: HullPlane = { heave: 0, pitchSlope: 0, rollSlope: 0 }

// Scratch for composing the boat's transform without allocating per frame, and
// a second one for the world frame's — kept separate so the boat's numbers and
// the world frame's, which differ, never share and clobber one scratch.
const poseEuler = new Euler()
const worldEuler = new Euler()

// Scratch for rotating the Sky's shading uniforms into the world frame — see
// the comment at the Sky uniform writes below for why this is necessary at all.
const SUN_VEC = new Vector3(...SUN)
const WORLD_UP = new Vector3(0, 1, 0)
const sunScratch = new Vector3()
const upScratch = new Vector3()

/**
 * The lit, moving world.
 *
 * Motion is carried by two frames rather than by moving the boat alone, which is
 * what lets the rocking read correctly from every stop with a camera that never
 * leaves world space. The boat's would-be motion `M` — heave and pitch and roll
 * off the waves, plus the heel the wind presses on — is split between them by a
 * coupling factor `a` that is 0 out on the ocean and 1 once aboard:
 *
 *  - the boat frame gets `(1 - a)·M`, so from the water you watch the hull rock
 *    and heel against a level horizon;
 *  - the world frame gets `-a·M`, so once you are aboard the hull holds still
 *    and the entire world — sea, sky, cloud and sun together — turns around it
 *    instead. That is exactly what being aboard really is: you brace against the
 *    hull and your head rolls with it, so the horizon and the cloud above it
 *    tilt together, locked to each other the way they are in life. It needs no
 *    camera trickery to pull off, only putting the sky in the same rotating
 *    frame as the sea instead of leaving it rigid in world space.
 *
 * Their difference is `M` at every value of `a`, so the boat always sits right
 * on the water; only which of the two you see moving changes as you come aboard.
 * That is also why coming below no longer freezes the boat: the motion does not
 * stop, it moves from the hull to the horizon.
 *
 * Lighting is the cheap, self-contained rig from before — Sky, one shadow sun,
 * and an Environment of local Lightformers for the reflections. Out on the
 * water the world frame is level and the boat frame carries the rocking; aboard
 * it is the reverse, so the sun and sky ride with the sea rather than staying
 * fixed while the horizon moves under them.
 */
export function PortfolioWorld() {
  const scene = useSceneStore((s) => s.scene)
  // Narrow selectors only — this component sits at the top of the tree, so a
  // subscription to `settings` wholesale would re-render the entire world on
  // any quality field changing, not just the two this component reads.
  const shadows = useQualityStore((s) => s.settings.shadows)
  const envResolution = useQualityStore((s) => s.settings.sky.envResolution)

  const boatFrame = useRef<Group>(null)
  const worldFrame = useRef<Group>(null)
  const coupling = useRef(0)
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const sky = useRef<ComponentRef<typeof Sky>>(null)
  const fog = useRef<FogExp2>(null)
  // Counts frames since the shadow map was last rebuilt, so the `useFrame`
  // below can force one back on every `shadows.shadowInterval`th frame.
  const shadowFrame = useRef(0)

  // The sun's shadow map re-renders all 89 meshes of the GLB into a depth
  // target, and the only things that move it — the boat's roll and the sun's
  // drift — are both around 1 Hz, so a two- or three-frame-stale map is
  // invisible at 60 fps. Turning off `autoUpdate` stops three.js rebuilding it
  // every frame by default; the interval below opts back in on a schedule.
  useLayoutEffect(() => {
    if (sun.current) sun.current.shadow.autoUpdate = false
  }, [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const c = sampleConditions(t)

    // Ease between the two frames as you come aboard and back.
    const target = scene === 'ocean' ? 0 : 1
    coupling.current = MathUtils.damp(coupling.current, target, 3, delta)
    const a = coupling.current

    // The boat's motion off the shared sea and wind. Buoyancy weighs the sea at
    // the weather's own amplitude — the same scale the water shader draws — so
    // the boat rides higher and pitches harder as the sea gets up, and the two
    // never drift apart.
    //
    // It floats on the mean plane of the water under the whole hull, not on the
    // height at its ends: a boat lies across more than one crest of the short
    // chop at once, so that chop cancels itself out underneath it while the long
    // swell still lifts and heels it fully. That is a property of the fit rather
    // than a filter laid over the top of it — see `sampleHullPlane`.
    const amp = c.seaAmp
    sampleHullPlane(HALF_LENGTH, HALF_BEAM, t, amp, hullPlane)
    const heave = hullPlane.heave
    const pitch = hullPlane.pitchSlope * PITCH_GAIN
    const roll = hullPlane.rollSlope * ROLL_GAIN + heelAngle(c.wind, t)
    const yaw = Math.sin(t * 0.13) * 0.02

    // The light and sky follow the same front. The sun that casts shadows dims
    // and greys under cloud; the soft hemisphere fill rises to stand in for an
    // overcast sky that lights everything flatly; the drei Sky hazes; and the
    // scene fog thickens and takes the fog's own colour so the boat, the sea and
    // the sky all dissolve into one horizon.
    if (sun.current) {
      sun.current.intensity = c.sunIntensity
      sun.current.color.copy(c.sun)
      // `shadowInterval` is 1 at the top tier, so this fires every frame there
      // and the throttle is a no-op — the map only actually goes stale below it.
      shadowFrame.current += 1
      if (shadowFrame.current >= shadows.shadowInterval) {
        shadowFrame.current = 0
        sun.current.shadow.needsUpdate = true
      }
    }
    if (hemi.current) hemi.current.intensity = c.ambient
    if (fog.current) {
      fog.current.density = c.fogDensity
      fog.current.color.copy(c.fog)
    }
    // The world frame's own rotation, built once so the sky uniforms below,
    // the group transform further down and the published quaternion all agree.
    worldEuler.set(-a * pitch, -a * yaw, -a * roll)

    const skyUniforms = sky.current?.material.uniforms
    if (skyUniforms) {
      skyUniforms.turbidity.value = c.skyTurbidity
      skyUniforms.rayleigh.value = c.skyRayleigh
      skyUniforms.mieCoefficient.value = c.skyMie
      // The drei Sky shades purely from world-space view direction against its
      // own sunPosition and up uniforms — it ignores the mesh's transform, so
      // parenting it to the rotating world frame alone changes nothing on
      // screen. Rotate the uniforms themselves by the frame's rotation so the
      // sun and horizon the shader paints agree with where the frame has
      // turned the mesh.
      if (skyUniforms.sunPosition) {
        sunScratch.copy(SUN_VEC).applyEuler(worldEuler)
        skyUniforms.sunPosition.value.copy(sunScratch)
      }
      if (skyUniforms.up) {
        upScratch.copy(WORLD_UP).applyEuler(worldEuler)
        skyUniforms.up.value.copy(upScratch)
      }
    }

    const boat = boatFrame.current
    if (boat) {
      boat.position.y = (1 - a) * heave
      boat.rotation.set((1 - a) * pitch, (1 - a) * yaw, (1 - a) * roll)
    }
    const world = worldFrame.current
    if (world) {
      world.position.y = -a * heave
      world.rotation.copy(worldEuler)
    }

    // Publish the boat frame's inverse for the sea shader's hull test —
    // composed here from the same numbers just applied, not read back from the
    // scene graph, whose matrices update after this callback and would lag.
    poseEuler.set((1 - a) * pitch, (1 - a) * yaw, (1 - a) * roll)
    boatWorldInverse.makeRotationFromEuler(poseEuler)
    boatWorldInverse.setPosition(0, (1 - a) * heave, 0)
    boatWorldInverse.invert()

    // Publish the world frame's own rotation — same numbers as the group
    // above, not read back from the scene graph — so Ocean.tsx can turn its
    // sun into world space without a frame of lag.
    worldFrameQuat.setFromEuler(worldEuler)
  })

  return (
    <>
      <CameraRig />

      {/* The scene fog: the haze the boat, sea and sky all fade into. Thin and
          blue in the clear, thick and grey in a squall, near-white in fog — all
          driven per frame above. The ocean shader matches this exact density and
          colour so the sea's horizon dissolves into the same wall. */}
      <fogExp2 ref={fog} attach="fog" args={['#cfdae4', 0.0016]} />

      {/* The cloud deck the opening flight falls through — sibling of
          `Weather` rather than inside either moving frame, since it tracks the
          camera directly and has no position of its own to rock with. */}
      <IntroClouds />

      {/* The title card the flight punches through on the way down — same
          sibling position as `IntroClouds` and the same reasoning: it tracks
          the fixed shot rather than either moving frame, so it has no
          position of its own to rock with. */}
      <IntroTitle />

      {/* The sea, the wind and the rain, synthesised rather than played back —
          see `audio/soundscape.ts`. In the tree beside `Weather` because it is
          the same weather: both read `sampleConditions` at the frame's own
          time, so what you hear and what you see are one front. Outside the
          boat frame, since it has no position — it is the world's ambience, not
          a source on the hull.

          The graph itself is not built here; `audio/engine.ts` has it warm and
          silent long before this mounts, so the sound does not queue behind the
          GLB. This is only what drives it. */}
      <Soundscape />

      {/* The reflection cubemap. It bakes the gradient dome — a real horizon and
          a hot sun — so anything glossy on the boat reflects a sky that meets a
          sea, not a flat blob. Baked exactly once (see `sky.envResolution` in
          `quality.ts`), so it costs a single render regardless of tier and
          buys visibly sharper highlights on the stainless and glass. */}
      <Environment resolution={envResolution}>
        <EnvSky sun={SUN} />
      </Environment>

      {/* The world rocks when you are aboard; the boat and everything on it
          rocks when you are on the water. See the coupling above. Sky, lights
          and cloud ride in this frame together with the sea, so the horizon
          and the sky above it turn as one rigid body around the fixed
          camera — exactly what really moves when a boat rolls. */}
      <group ref={worldFrame}>
        <Sky
          ref={sky}
          sunPosition={SUN}
          turbidity={5}
          rayleigh={1.4}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
        />

        <hemisphereLight ref={hemi} args={['#cfe3ff', '#1b3038', 0.55]} />

        <directionalLight
          ref={sun}
          position={SUN}
          intensity={2.6}
          color="#fff4e6"
          castShadow
          shadow-mapSize={[shadows.mapSize, shadows.mapSize]}
          shadow-bias={-0.0002}
          shadow-normalBias={0.02}
        >
          <orthographicCamera attach="shadow-camera" args={[-7, 7, 9, -9, 0.1, 80]} />
        </directionalLight>

        <Weather />

        <Ocean />
      </group>
      <group ref={boatFrame}>
        <Boat />
        {/* Daylight below deck. The sun cannot get in — the coachroof is opaque
            and the windows are smoked — so without these the cabin renders very
            nearly black, which is no use as a stop on the path. Two soft, cheap
            point lights stand in for what really lights a cabin at sea: the
            companionway hatch behind you and the side windows. Inside the boat
            frame, so they ride with it. */}
        <pointLight position={[0, 1.0, 0.5]} intensity={2.6} distance={5} decay={2} color="#eef3ff" />
        <pointLight position={[0, 0.85, -2.1]} intensity={1.3} distance={3.5} decay={2} color="#e8eefc" />
        {/* The desk lamp on the chart table. The GLB carries the fitting and an
            emissive disc across the mouth of its shade — so it *looks* lit — but
            `blender/build.py` exports with `export_lights=False`, so nothing in
            the model can cast the pool of light under it. This is that pool.

            Its position is the shade's own, converted once from the numbers that
            place the lamp: `params.DESK_LAMP_X + 0.170` and `DESK_LAMP_STATION +
            0.180` are where `fitout._desk_lamp` hangs the shade, and glTF's
            y-up export maps Blender (x, y, z) to (x, z, -y). Warm and short-
            range on purpose: it has to read as a lamp throwing light on a chart,
            not as a second sun below deck, so it barely reaches the far settee. */}
        <pointLight
          position={[-0.88, 0.736, 0.9725]}
          intensity={1.1}
          distance={1.6}
          decay={2}
          color="#ffd9a0"
        />
        <Cabin />
        <CabinHatch />
        {/* Inside the boat frame with everything else aboard: the close-up
            targets are fixed to the joinery they sit over. */}
        <FocusTargets />
        {/* The two lettered book spines, sharing the model's own frame so
            their hit-testing needs no world-space maths (see BookSpines.tsx). */}
        <BookSpines />
        {/* The two photos on the main bulkhead, outboard of the brass — one of
            the boat, one of the owner's dogs, ridden with the hull like
            everything else fixed to the joinery. See CabinPictures.tsx for why
            they're deliberately not a matched pair. */}
        <CabinPictures />
        {/* Polly, the guide character — perched on deck, so a sibling of
            `Boat` here rather than a new exhibit; see `parrot/`. */}
        <ParrotAssistant />
        <Exhibits />
      </group>

      <Effects />
      <QualityMonitor />
      <FocusQuality />
    </>
  )
}

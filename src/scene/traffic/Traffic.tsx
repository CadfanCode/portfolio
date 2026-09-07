import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Object3D } from 'three'
import { useQualityStore } from '../../state/useQualityStore'
import ferryUrl from '../../assets/models/traffic/ferry.glb?url'
import sailboatAUrl from '../../assets/models/traffic/sailboat-a.glb?url'
import sailboatBUrl from '../../assets/models/traffic/sailboat-b.glb?url'
import steamerUrl from '../../assets/models/traffic/steamer.glb?url'
import tugUrl from '../../assets/models/traffic/tug.glb?url'
import { sampleConditions } from '../conditions'
import { sampleHeight } from '../water/waves'
import { heelAngle, WIND_DEG } from '../wind'
import type { VesselClass } from './fleet'
import { normaliseModel } from './normalise'
import { lanePoint, laneHeading } from './rails'
import { vesselDistance } from './scheduler'
import { useTraffic, vesselClass } from './useTraffic'
import type { ActiveVessel } from './useTraffic'
import { Wake } from './Wake'

/**
 * Background boat traffic: a handful of vessels riding the three lanes in
 * `rails.ts`, on a Poisson spawn/despawn schedule (`scheduler.ts`), floating
 * on the same wave field the player's own boat does. Mounted in `worldFrame`
 * (see `PortfolioWorld.tsx`) so it rocks with the horizon rather than the
 * hull — vessels are part of the sea being watched, not the boat watching it.
 *
 * Deliberately not interactive: no pointer handlers anywhere in this module.
 * A click anywhere else in the scene means "this is an exhibit", and a
 * traffic vessel that suddenly behaved like one would dilute that far more
 * than the vessels themselves add.
 */

const MODEL_URL: Record<VesselClass['id'], string> = {
  sail_a: sailboatAUrl,
  sail_b: sailboatBUrl,
  tug: tugUrl,
  steamer: steamerUrl,
  ferry: ferryUrl,
}

for (const url of Object.values(MODEL_URL)) useGLTF.preload(url)

/** Beam as a fraction of length — no fleet entry carries a real beam, and a
 *  cheap ratio is all the pitch/roll finite-difference below needs to know
 *  how far apart to sample the water across the hull. */
const BEAM_RATIO = 0.28

/**
 * Gains on the raw fore-aft and side-to-side wave slopes below, matching
 * `PortfolioWorld.tsx`'s own `PITCH_GAIN`/`ROLL_GAIN` so a passing vessel and
 * the player's own hull respond to the same sea by the same amount. Traffic
 * vessels get a plain two-point finite difference rather than
 * `sampleHullPlane`'s five-by-three least-squares fit — they are seen from
 * much further away than the player's own boat, so the short chop that fit
 * exists to filter out is already below the pixel a traffic vessel occupies.
 */
const PITCH_GAIN = 0.55
const ROLL_GAIN = 0.65

/** No real sailboat points inside this many degrees of the true wind — the
 *  "in irons" zone a boat has to tack around rather than sail through. */
const CLOSE_HAULED_DEG = 40
const CLOSE_HAULED_RAD = (CLOSE_HAULED_DEG * Math.PI) / 180

/** Wraps an angle into (-PI, PI], the form the close-hauled bias below needs
 *  to tell which side of dead-upwind a heading already leans toward. */
function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/**
 * `rails.ts` bearings are compass-style (0 = -Z, clockwise) while `wind.ts`'s
 * `WIND_DEG` is a plain math angle (0 = +X, counter-clockwise) — the bearing
 * that names the same direction as `WIND_DEG` is `90 + WIND_DEG` (verified:
 * `(cos a, sin a) == (sin(90+a), -cos(90+a))` for every `a`). The heading a
 * boat would need to sail dead upwind — bow pointed at where the wind comes
 * from — is that direction turned through 180 degrees.
 */
const INTO_WIND_BEARING_RAD = ((90 + WIND_DEG + 180) * Math.PI) / 180

/**
 * Nudges a sailboat's rendered heading off dead upwind if the lane happens to
 * point it that way, so it never reads as sailing straight into the wind — a
 * real yacht cannot. Purely cosmetic: the vessel still slides along its rail
 * exactly on schedule, only the hull's facing gets biased, the same kind of
 * fake cheap effect the heel and the wake are.
 */
function closeHauledBias(headingRad: number, tieBreak: number): number {
  const diff = wrapPi(headingRad - INTO_WIND_BEARING_RAD)
  if (Math.abs(diff) >= CLOSE_HAULED_RAD) return 0
  const side = diff !== 0 ? Math.sign(diff) : tieBreak % 2 === 0 ? 1 : -1
  return side * (CLOSE_HAULED_RAD - Math.abs(diff))
}

export function Traffic() {
  const active = useTraffic()
  const wakes = useQualityStore((s) => s.settings.traffic.wakes)

  return (
    <>
      {active.map((v) => (
        <Vessel key={`${v.lane.id}-${v.id}`} vessel={v} wakes={wakes} />
      ))}
    </>
  )
}

type VesselProps = { vessel: ActiveVessel; wakes: boolean }

function Vessel({ vessel, wakes }: VesselProps) {
  const cls = vesselClass(vessel.classId)
  const url = MODEL_URL[cls.id]
  const { scene } = useGLTF(url)

  // `useGLTF` caches and shares one scene graph per url across every vessel
  // of this class; mutating it directly would move them all together, so
  // each vessel gets its own clone. `measureAndNormalise` is expensive
  // enough to be worth memoising (see `normaliseModel`), but a clone is
  // cheap and every vessel needs its own regardless.
  const clone = useMemo<Object3D>(() => scene.clone(true), [scene])
  const normalised = normaliseModel(url, scene, cls.lengthM)

  const group = useRef<Group>(null)

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    const c = sampleConditions(t)
    const ampScale = c.seaAmp

    const d = vesselDistance(vessel, t)
    const [x, z] = lanePoint(vessel.lane, d)

    // The lane's own travel axis, taken as a unit step of `lanePoint` rather
    // than re-deriving the lane's trig locally — this stays correct however
    // `rails.ts` computes its bearings, since it asks the module for the
    // answer instead of assuming its formula.
    const [fx0, fz0] = lanePoint(vessel.lane, d - 0.5)
    const [fx1, fz1] = lanePoint(vessel.lane, d + 0.5)
    const fwdX = fx1 - fx0
    const fwdZ = fz1 - fz0
    // Perpendicular to the travel axis, for the roll sample.
    const rightX = -fwdZ
    const rightZ = fwdX

    const halfLen = cls.lengthM / 2
    const halfBeam = (cls.lengthM * BEAM_RATIO) / 2
    const hFwd = sampleHeight(x + fwdX * halfLen, z + fwdZ * halfLen, t, ampScale)
    const hAft = sampleHeight(x - fwdX * halfLen, z - fwdZ * halfLen, t, ampScale)
    const hRight = sampleHeight(x + rightX * halfBeam, z + rightZ * halfBeam, t, ampScale)
    const hLeft = sampleHeight(x - rightX * halfBeam, z - rightZ * halfBeam, t, ampScale)
    const heave = sampleHeight(x, z, t, ampScale)
    const pitch = ((hAft - hFwd) / (2 * halfLen)) * PITCH_GAIN
    let roll = ((hRight - hLeft) / (2 * halfBeam)) * ROLL_GAIN

    let heading = laneHeading(vessel.lane, vessel.dir) + normalised.yaw
    if (cls.heels) {
      roll += heelAngle(c.wind, t)
      heading += closeHauledBias(heading, vessel.id)
    }

    g.position.set(x, heave, z)
    g.rotation.set(pitch, heading, roll)
  })

  return (
    <group ref={group} raycast={() => null}>
      <group scale={normalised.scale}>
        <primitive object={clone} />
      </group>
      {wakes && <Wake lengthM={cls.lengthM} />}
    </group>
  )
}


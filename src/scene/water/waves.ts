import { Vector2 } from 'three'
import { WIND_DEG } from '../wind'

/**
 * The sea state, in one place — the single source of truth the water surface and
 * the boat's buoyancy both read, so the boat floats on exactly the waves you can
 * see rather than on a second, private guess at them.
 *
 * These are Gerstner waves: unlike a plain sum of sines, they move each point on
 * a small circle rather than just up and down, which piles water into sharp
 * crests and flattens the troughs — the shape an actual sea has. A handful of
 * trains crossing at slight angles is enough; the longest and largest is the
 * swell, the shorter ones are the chop riding on it.
 *
 * These amplitudes are the *reference* sea — a fair-weather day. The weather in
 * `conditions.ts` scales them up and down with an `ampScale`: ~0.15× for a
 * glassy calm, ~2.6× for a storm. Both the shader (a `uAmpScale` uniform) and
 * the buoyancy (`sampleHeight`'s argument) take the same factor, so the boat
 * keeps floating on exactly the sea that is drawn however rough it gets.
 */

export const GRAVITY = 9.81

export type WaveSpec = {
  /** How far off the wind this train runs, degrees. A real sea is not a single
   *  heading: the wind raises a spread of trains either side of its own bearing,
   *  the longest closest to it and the short chop fanning wider. Stored as an
   *  offset from `WIND_DEG` rather than an absolute heading so the sea always
   *  runs with the wind that made it — see `wind.ts`. */
  spreadDeg: number
  /** Crest-to-mean height, metres. */
  amplitude: number
  /** Crest-to-crest distance, metres. Sets the speed too, via deep-water
   *  dispersion (ω = √(g·k)) — long waves run faster than short ones, which is
   *  what keeps the trains sliding through each other instead of marching in
   *  lockstep. */
  wavelength: number
  /** 0…1. How peaked the crests are; 1 is as sharp as this wave can go before
   *  it curls over itself. Kept below 1 because several summed can loop where
   *  one alone would not. */
  steepness: number
}

export const WAVES: WaveSpec[] = [
  { spreadDeg: 0, amplitude: 0.22, wavelength: 17.0, steepness: 0.55 },
  { spreadDeg: -32, amplitude: 0.12, wavelength: 9.5, steepness: 0.7 },
  { spreadDeg: 28, amplitude: 0.05, wavelength: 5.2, steepness: 0.8 },
]

export type DerivedWave = {
  dir: Vector2
  /** Spatial frequency, 2π/wavelength. */
  k: number
  /** Angular frequency, √(g·k). */
  omega: number
  amplitude: number
  /** Horizontal displacement amplitude, Q·A — how far a point swings sideways.
   *  Q is the steepness spread across the wave count so summed crests stay
   *  single-valued. */
  qa: number
}

export const DERIVED: DerivedWave[] = WAVES.map((w) => {
  const k = (2 * Math.PI) / w.wavelength
  const omega = Math.sqrt(GRAVITY * k)
  const rad = ((WIND_DEG + w.spreadDeg) * Math.PI) / 180
  const q = w.steepness / (k * w.amplitude * WAVES.length)
  return {
    dir: new Vector2(Math.cos(rad), Math.sin(rad)),
    k,
    omega,
    amplitude: w.amplitude,
    qa: q * w.amplitude,
  }
})

/**
 * How close the reference sea sits to folding, at steepness scale 1: the sum of
 * every train's Q·A·k. Both the surface's own Jacobian in the vertex shader and
 * the limit below are written in terms of this one number.
 */
export const REFERENCE_STEEPNESS = DERIVED.reduce((s, w) => s + w.qa * w.k, 0)

/**
 * The most total steepness the summed trains are allowed to reach.
 *
 * A Gerstner wave swings each point on a circle of radius Q·A. Once the trains
 * together pass Σ(Q·A·k) = 1 the circles are wider than the wave is long, the
 * surface passes through itself, and the crests turn inside out — water moving
 * sideways further than it moves up, which reads as a sea sloshing rather than
 * running. Held just under 1 so the odd crest where the phases all line up still
 * pinches over and throws foam (`vFold` in the sea shader is exactly that), but
 * the sheet as a whole never inverts.
 */
const FOLD_LIMIT = 0.9

/**
 * The steepness multiplier to actually hand the sea shader, given the weather's
 * amplitude and chop scales.
 *
 * The naive product `ampScale · chop` is what the weather asks for, and in a
 * squall it asks for about twice what Gerstner can draw — a 2.5× sea at 1.17×
 * chop wants Σ(Q·A·k) ≈ 2. This eases that demand onto the fold limit instead of
 * clipping it: gentle seas pass through very nearly untouched, and the harder
 * the weather leans the less of each extra increment it gets, approaching the
 * limit without ever crossing it. Which is what a real sea does — waves cannot
 * keep steepening past their limiting form, they break instead.
 *
 * Note it scales *steepness*, not height: a squall still raises the same big
 * water, it just stops trying to peak it past the point the maths holds.
 */
export function steepScale(ampScale: number, chop: number): number {
  const spread = REFERENCE_STEEPNESS * ampScale
  const asked = spread * chop
  if (asked < 1e-6) return chop
  const eased = FOLD_LIMIT * (1 - Math.exp(-asked / FOLD_LIMIT))
  return eased / spread
}

/**
 * The height of the sea at a world point and time — the vertical part of the
 * Gerstner sum, evaluated at the undisplaced (x, z).
 *
 * This is the CPU half of the shared model, and it is only the height because
 * that is all the boat needs: the hull's heave, pitch and roll come from
 * sampling this at a few points around it and comparing them, not from the wave
 * normal. It ignores the small horizontal swing of Gerstner — which moves where
 * a crest *is* by a few centimetres but not how *high* it is — because chasing
 * that would mean inverting the displacement per sample for a difference no one
 * standing on a 7.6 m boat could feel.
 */
export function sampleHeight(x: number, z: number, time: number, ampScale = 1): number {
  let h = 0
  for (const w of DERIVED) {
    const phase = w.k * (w.dir.x * x + w.dir.y * z) - w.omega * time
    h += w.amplitude * Math.sin(phase)
  }
  return h * ampScale
}

/** The mean plane of the sea under the hull: how high it floats and how the
 *  water tilts across it. */
export type HullPlane = {
  /** Mean sea height over the footprint, metres. */
  heave: number
  /** d(height)/dz across the boat's length — positive is stern-up. */
  pitchSlope: number
  /** d(height)/dx across the boat's beam — positive is starboard-up. */
  rollSlope: number
}

// The footprint the hull is weighed over: five stations fore-and-aft by three
// lines athwartships, as fractions of the half-length and half-beam. Symmetric
// about the origin, which is what lets the fit below collapse to three sums.
const STATIONS = [-1, -0.5, 0, 0.5, 1]
const LINES = [-1, 0, 1]
const SAMPLE_COUNT = STATIONS.length * LINES.length
// Σz² and Σx² over that grid, in units of half-length² and half-beam².
const SUM_ZZ = STATIONS.reduce((s, f) => s + f * f, 0) * LINES.length
const SUM_XX = LINES.reduce((s, f) => s + f * f, 0) * STATIONS.length

/**
 * The plane the hull floats on — the sea's mean height and its slope across the
 * boat, least-squares fitted over the whole footprint rather than read off two
 * points at either end.
 *
 * This is the difference between a boat and a cork. Sampling the surface at the
 * bow and stern alone makes the hull follow *every* wave that passes, including
 * ones shorter than it is — and a 7.6 m boat cannot heel to a 5.2 m wave, because
 * it is lying across more than one crest at once and the water pushing up on one
 * part is pushing down on the next. A real hull floats on the average of the sea
 * it covers, so the short chop cancels itself out under it while the long swell,
 * which the boat is small enough to sit on the face of, lifts and heels it fully.
 *
 * The averaging *is* the filter, which is why there is no filter: no smoothing,
 * no damping constant, no cutoff to tune. Fitting a plane to a symmetric grid of
 * samples attenuates each wave train by how much of it fits under the boat,
 * automatically and at the right amount for its own wavelength — the 5.2 m chop
 * loses ~90% of its leverage, the 9.5 m train ~6%, and the 17 m swell essentially
 * none. Because the grid is symmetric about the origin the normal equations
 * decouple, so the whole fit is three running sums and two divisions.
 *
 * Reads the same `sampleHeight` and the same `ampScale` the sea is drawn at, so
 * this stays what it has always been: the boat floating on the waves you can see.
 */
export function sampleHullPlane(
  halfLength: number,
  halfBeam: number,
  time: number,
  ampScale: number,
  out: HullPlane,
): HullPlane {
  let sum = 0
  let sumXH = 0
  let sumZH = 0
  for (const zf of STATIONS) {
    const z = zf * halfLength
    for (const xf of LINES) {
      const x = xf * halfBeam
      const h = sampleHeight(x, z, time, ampScale)
      sum += h
      sumXH += x * h
      sumZH += z * h
    }
  }
  out.heave = sum / SAMPLE_COUNT
  out.pitchSlope = sumZH / (SUM_ZZ * halfLength * halfLength)
  out.rollSlope = sumXH / (SUM_XX * halfBeam * halfBeam)
  return out
}

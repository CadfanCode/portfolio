import { Vector2 } from 'three'

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
 * Deliberately gentle. A moored 7.6 m boat in this rocks and nods; it does not
 * surf. The amplitudes are the knob to turn for a rougher day.
 */

export const GRAVITY = 9.81

export type WaveSpec = {
  /** Heading the train travels, degrees, in the world XZ plane. */
  angleDeg: number
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
  { angleDeg: 18, amplitude: 0.22, wavelength: 17.0, steepness: 0.55 },
  { angleDeg: -14, amplitude: 0.12, wavelength: 9.5, steepness: 0.7 },
  { angleDeg: 46, amplitude: 0.05, wavelength: 5.2, steepness: 0.8 },
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
  const rad = (w.angleDeg * Math.PI) / 180
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
export function sampleHeight(x: number, z: number, time: number): number {
  let h = 0
  for (const w of DERIVED) {
    const phase = w.k * (w.dir.x * x + w.dir.y * z) - w.omega * time
    h += w.amplitude * Math.sin(phase)
  }
  return h
}

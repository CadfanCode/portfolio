/**
 * Noise — the one raw ingredient every voice in the soundscape is made of.
 *
 * Sea, wind, rain, the wash along the hull and the cloth working in the rig are
 * all the same thing physically: broadband noise, shaped. What tells them apart
 * to an ear is which part of the spectrum survives and how the level moves, and
 * both of those are a filter and an envelope away from a single buffer. So there
 * is one buffer here, generated once, and `soundscape.ts` fans it out.
 *
 * `brown` tilts the spectrum. At 0 this is white noise — flat, hissy, the raw
 * material for rain and for the sail's rustle. At 1 it is brown: a leaky
 * integrator over the same samples, which rolls off about 6 dB per octave and
 * is what a swell actually sounds like. Everything in between is a mix. Two
 * buffers, one of each, cover every voice in the file.
 *
 * ## Looping without a tick
 *
 * A noise buffer played on loop is discontinuous at the seam — the last sample
 * and the first are unrelated, and that step is a click, once every few seconds,
 * forever. It is the single most recognisable artefact of cheap looped ambience.
 *
 * The fix is to crossfade the head of the buffer into what would have been the
 * seam and then loop *short* of the end. `loopEnd` is where the tail begins;
 * playback runs `[0, loopEnd)` and wraps, and because sample 0 was blended to
 * equal the sample at `loopEnd`, the wrap is continuous. The tail past `loopEnd`
 * is never played — it is scratch that the head was mixed against.
 */

/** Seconds of buffer given to the loop crossfade. Long enough that the blend is
 *  inaudible as a swell in level, short against the buffer it is taken from. */
const CROSSFADE = 0.35

export type Noise = {
  buffer: AudioBuffer
  /** Where the loop wraps, in seconds. Not the buffer's own duration. */
  loopEnd: number
}

export function makeNoise(ctx: AudioContext, seconds: number, brown: number): Noise {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  // White, and a running leaky integral of it. The integrator is what turns a
  // flat spectrum into a tilted one; the leak (the 1/1.02) is what stops it
  // wandering off into a DC offset over a hundred thousand samples.
  let integral = 0
  let peak = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    integral = (integral + 0.02 * white) / 1.02
    const value = white * (1 - brown) + integral * brown
    data[i] = value
    const magnitude = value < 0 ? -value : value
    if (magnitude > peak) peak = magnitude
  }

  // Normalise, so a voice's gain means the same thing whatever tilt it asked
  // for. Brown noise comes out of the integrator an order of magnitude quieter
  // than white, and without this every gain in `soundscape.ts` would have to
  // carry a correction for which buffer it happened to be reading.
  const scale = peak > 0 ? 0.92 / peak : 1
  for (let i = 0; i < length; i++) data[i] *= scale

  const fade = Math.min(Math.floor(ctx.sampleRate * CROSSFADE), Math.floor(length / 4))
  const seam = length - fade
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    data[i] = data[i] * t + data[seam + i] * (1 - t)
  }

  return { buffer, loopEnd: seam / ctx.sampleRate }
}

/**
 * A looping player for one of those buffers.
 *
 * `rate` detunes the playback slightly, and every voice asks for a different
 * one. Without it, six voices reading the same buffer are six filtered copies
 * of one signal, correlated sample for sample — which does not sound like six
 * sources in a place, it sounds like one source through a comb filter. A few
 * per cent of rate difference decorrelates them completely and costs nothing.
 *
 * The random start offset does the same job for the first few seconds, before
 * the rate difference has had time to pull them apart.
 */
export function noiseSource(ctx: AudioContext, noise: Noise, rate: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource()
  source.buffer = noise.buffer
  source.loop = true
  source.loopStart = 0
  source.loopEnd = noise.loopEnd
  source.playbackRate.value = rate
  source.start(0, Math.random() * noise.loopEnd)
  return source
}

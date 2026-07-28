import type { SceneState } from '../../state/useSceneStore'
import { sampleConditions } from '../conditions'
import { windStrength } from '../wind'
import { makeNoise, noiseSource } from './noise'
import type { Noise } from './noise'

/**
 * The soundscape: the sea, the wind, the rain and the gulls, generated rather
 * than played back.
 *
 * ## Why there are no audio files
 *
 * `assets/audio/` is empty and stays empty. Every sound here is synthesised in
 * the Web Audio graph below, for three reasons that all point the same way.
 *
 * It is the same rule the rest of the scene follows. CLAUDE.md: fake cheap
 * effects over real simulation. The sea is a Gerstner sum, the sails are a
 * vertex displacement, the weather is six numbers drifting — none of it is
 * recorded or simulated, all of it is a cheap parametric stand-in that reacts.
 * A wave file is the one thing in the project that could not react to anything.
 *
 * It is driven by the same weather as the picture. `update` reads
 * `sampleConditions` and `windStrength` — the *same* calls that set the wave
 * amplitude, the heel and the fog. So the sound cannot disagree with what is on
 * screen: the sea gets loud because it is the same number that made it rough,
 * and the rigging starts to whine in a squall because it is the number that is
 * already laying the boat over. Cross-fading recorded loops against the weather
 * would approximate this and drift.
 *
 * And it is free. The boat is a 6.7 MB GLB. A usable set of seamless ambience
 * loops is several megabytes more, and they loop audibly.
 *
 * ## The voices
 *
 *   swell     brown noise, low-passed — the bed under everything
 *   wash      band-passed white, slowly gated — the general surface of the sea
 *   breakers  one-shots: individual crests, scheduled at random intervals
 *   wind      band-passed white, near-silent below a real breeze
 *   rig       a narrow, high resonance that only speaks in a blow
 *   rain      high-passed white
 *   gulls     one-shots, in fair weather only
 *
 * ## Not sounding like a loop
 *
 * Four defences, because ambience that repeats is worse than no ambience — an
 * ear locks onto a period in about two cycles and then cannot un-hear it.
 *
 *   1. The noise buffers are long (9 and 13 seconds) and crossfaded at the seam,
 *      so there is no click to hang a period on. See `noise.ts`.
 *   2. Their playback rates are *detuned by a slow LFO*, so even that period is
 *      not constant — the buffer never lines up with itself twice.
 *   3. Every continuous level rides the product of two oscillators at unrelated
 *      rates, whose combined period is longer than anyone will sit here.
 *   4. The two things an ear actually latches onto — a wave breaking, a gull —
 *      are discrete one-shots at random intervals, built fresh each time with
 *      random size, pan, filter and decay. Nothing about a breaker repeats.
 *
 * There used to be a sails voice here: band-passed noise gated at a couple of
 * hertz to stand in for cloth working. It was removed at the owner's request
 * and the diagnosis was exactly right — a fast, regular tremolo on a fixed
 * noise band is a chugging, and what it sounded like was an engine idling below
 * decks. The lesson is defence 4 above: cloth working is a sequence of
 * *events*, and a periodic gate can never be one.
 *
 * ## Below decks
 *
 * Coming below drops a low-pass across the whole bus and pulls the airborne
 * voices down hard. A cabin is a GRP box: what reaches you through it is the
 * hull rumbling and the water against the topsides, not the wind or the gulls.
 * That contrast is most of what makes the companionway feel like a threshold.
 */

/** Where the whole bus sits before the limiter. */
const MASTER = 0.55

/** How much of each voice survives below decks, and how far the bus is filtered
 *  when it does. Sea and rain carry through a hull; wind and birds do not,
 *  which is the whole point of the contrast. */
const BELOW = { cutoff: 520, sea: 0.62, rain: 0.3, air: 0.16 }
const ABOVE = { cutoff: 20000, sea: 1, rain: 1, air: 1 }

/** Seconds between breaking crests, from a rough sea to a calm one. A glassy
 *  day still has the odd wave turn over; a gale has one every second or two. */
const BREAK_GAP = { rough: 1.1, calm: 9.0 }

/** Seconds between gull cries, at their most and least likely. */
const GULL_GAP = { min: 7, max: 34 }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Ramp that stays at 0 until `lo`, reaching 1 at `hi` — the same shape
 *  `conditions.ts` uses, and for the same reason: some things do not begin at
 *  all until the weather is genuinely up. */
const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo))
const between = (a: number, b: number) => a + Math.random() * (b - a)

export type Soundscape = {
  readonly context: AudioContext
  /** Re-aim every parameter at the weather of this moment. Cheap, but meant to
   *  be called at a dozen hertz, not sixty — see `Soundscape.tsx`. */
  update(time: number, scene: SceneState, ducked: boolean): void
  dispose(): void
}

type Voice = {
  gain: GainNode
  filter: BiquadFilterNode
  source: AudioBufferSourceNode
}

/**
 * One continuous voice: a noise source through one filter into one gain.
 *
 * Every band in this file is a single biquad. Two would be more accurate about
 * the shape of real wind and would also be two more nodes in the graph for a
 * difference nobody hears under a boat's worth of other noise.
 */
function voice(
  ctx: AudioContext,
  noise: Noise,
  dest: AudioNode,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  rate: number,
): Voice {
  const source = noiseSource(ctx, noise, rate)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(filter)
  filter.connect(gain)
  gain.connect(dest)
  return { gain, filter, source }
}

/**
 * A slow wobble on a source's playback rate.
 *
 * The single most effective thing in this file against the sense of a loop. A
 * buffer played at a fixed rate repeats every N seconds forever, and no amount
 * of filtering hides that from an ear that has heard it twice. Detuned by a
 * fraction of a per cent on a period of half a minute, the "same" section of
 * noise never arrives at the same speed twice and there is no period to find.
 *
 * Inaudible as pitch: this is noise, and 0.6% on noise is not a pitch change,
 * it is a different noise.
 */
function drift(ctx: AudioContext, source: AudioBufferSourceNode, rate: number, depth: number) {
  const lfo = ctx.createOscillator()
  lfo.frequency.value = rate
  const amount = ctx.createGain()
  amount.gain.value = depth
  lfo.connect(amount)
  amount.connect(source.playbackRate)
  lfo.start()
}

/**
 * An irregular slow swell on a gain, as two oscillators multiplied.
 *
 * A single LFO on a level is a tremolo, and an ear finds its period in about
 * two cycles. Multiplying two at unrelated rates gives a product whose envelope
 * does not repeat inside any listening session — the same trick `windStrength`
 * uses with two sines to fake a gust rhythm, and `waves.ts` with its unrelated
 * wave periods. Connecting the result to an AudioParam *adds* to that param's
 * own value, so the voice's gain is set normally and this rides on top of it.
 */
function swell(ctx: AudioContext, target: AudioParam, rateA: number, rateB: number): GainNode {
  const a = ctx.createOscillator()
  a.frequency.value = rateA
  const b = ctx.createOscillator()
  b.frequency.value = rateB

  // `product` is driven by B and fed by A, so its output is A x B. Its own
  // intrinsic gain is 0, so B is the only thing opening it.
  const product = ctx.createGain()
  product.gain.value = 0
  b.connect(product.gain)

  // How deep the swell goes. Set by the caller through this node, so a voice
  // can be modulated a lot or a little without rebuilding the pair.
  const depth = ctx.createGain()
  depth.gain.value = 0

  a.connect(product)
  product.connect(depth)
  depth.connect(target)
  a.start()
  b.start()
  return depth
}

/**
 * One wave turning over, somewhere around the boat.
 *
 * The voice that carries the whole soundscape, and the only one that is an
 * event rather than a level. A sea is not a texture — it is a sequence of
 * individual crests arriving at intervals that never repeat — and this is the
 * difference between "the sound of the sea" and "a hiss that gets louder in
 * bad weather".
 *
 * Each is built from scratch and thrown away: its own noise offset, pan,
 * length, loudness and filter sweep, all randomised inside a range that `size`
 * widens. The sweep is what makes it a wave rather than a whoosh — a crest
 * breaks bright and hissing and then drains away dull, so the band starts high,
 * opens wider as it peaks, and falls through the decay.
 */
function breaker(ctx: AudioContext, noise: Noise, dest: AudioNode, size: number) {
  const now = ctx.currentTime + 0.02
  const attack = between(0.12, 0.4) * lerp(1.4, 0.7, size)
  const decay = between(0.9, 2.4) * lerp(0.8, 1.35, size)
  const peak = between(0.5, 1) * size

  const source = noiseSource(ctx, noise, between(0.88, 1.14))

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = between(0.5, 0.9)
  const top = between(1300, 2600)
  band.frequency.setValueAtTime(top, now)
  band.frequency.exponentialRampToValueAtTime(top * 0.72, now + attack)
  band.frequency.exponentialRampToValueAtTime(between(220, 420), now + attack + decay)

  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, now)
  env.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay)

  const panner = ctx.createStereoPanner()
  panner.pan.value = between(-0.85, 0.85)

  source.connect(band)
  band.connect(env)
  env.connect(panner)
  panner.connect(dest)

  const end = now + attack + decay + 0.05
  source.stop(end)
  source.onended = () => {
    source.disconnect()
    band.disconnect()
    env.disconnect()
    panner.disconnect()
  }
}

/**
 * One gull, some distance off.
 *
 * A cry is three to five short notes, each a fast rise and a longer fall in
 * pitch, through a band-pass that stands in for the bird's own resonance. A
 * sawtooth rather than a sine because a gull is a rough, buzzy sound and the
 * harmonics are most of what makes it recognisable at all.
 */
function gullCry(ctx: AudioContext, dest: AudioNode, level: number): number {
  const panner = ctx.createStereoPanner()
  panner.pan.value = between(-0.8, 0.8)
  panner.connect(dest)

  // Further off means quieter and duller — one number doing both, so a distant
  // bird cannot come out muffled and loud.
  const distance = between(0.35, 1)

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = between(1500, 2200) * (0.75 + 0.25 * distance)
  band.Q.value = 1.3
  band.connect(panner)

  const notes = 3 + Math.floor(Math.random() * 3)
  let at = ctx.currentTime + 0.05
  for (let i = 0; i < notes; i++) {
    const length = between(0.15, 0.25)
    const base = between(760, 1000) * (1 - i * 0.06)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(base * 0.68, at)
    osc.frequency.exponentialRampToValueAtTime(base * 1.45, at + length * 0.2)
    osc.frequency.exponentialRampToValueAtTime(base * 0.72, at + length)

    const env = ctx.createGain()
    const peak = Math.max(0.0002, level * distance * (i === 0 ? 1 : 0.82))
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(peak, at + 0.03)
    env.gain.exponentialRampToValueAtTime(0.0001, at + length)

    osc.connect(env)
    env.connect(band)
    osc.start(at)
    osc.stop(at + length + 0.05)
    osc.onended = () => {
      osc.disconnect()
      env.disconnect()
    }

    at += length + between(0.09, 0.17)
  }

  const done = at + 0.3
  window.setTimeout(
    () => {
      band.disconnect()
      panner.disconnect()
    },
    (done - ctx.currentTime) * 1000,
  )
  return done
}

export function createSoundscape(ctx: AudioContext): Soundscape {
  // Long buffers. See "Not sounding like a loop" above: this is the first of
  // the four defences and the cheapest — a few megabytes of float that never
  // leave memory, against a period an ear can find.
  const white = makeNoise(ctx, 9, 0)
  const brown = makeNoise(ctx, 13, 1)

  // --- The bus. Everything lands here, gets the hull's low-pass if the camera
  // is below decks, then the master level, then a limiter.
  //
  // The limiter is not decoration: in a squall the sea, the wind, the rig and
  // the rain are all at their loudest at once, by construction — they are one
  // weather. Without it their sum clips, and clipping is the one artefact that
  // will not read as "rough weather" but as "broken website".
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 6
  limiter.ratio.value = 8
  limiter.attack.value = 0.004
  limiter.release.value = 0.2
  limiter.connect(ctx.destination)

  const master = ctx.createGain()
  master.gain.value = MASTER
  master.connect(limiter)

  const hull = ctx.createBiquadFilter()
  hull.type = 'lowpass'
  hull.frequency.value = ABOVE.cutoff
  hull.Q.value = 0.7
  hull.connect(master)

  // --- The sea.

  // The swell: brown noise with most of the top taken off. The floor of the
  // whole scene and the only voice that is never silent — even a glassy day has
  // water moving under the boat.
  const sea = voice(ctx, brown, hull, 'lowpass', 220, 0.8, 1)
  const seaSwell = swell(ctx, sea.gain.gain, 0.073, 0.041)
  drift(ctx, sea.source, 0.029, 0.006)

  // The general surface: the hiss of a sea that is up, and the wash running
  // along the topsides. Under the breakers rather than instead of them.
  const wash = voice(ctx, white, hull, 'bandpass', 1250, 0.7, 0.93)
  const washSwell = swell(ctx, wash.gain.gain, 0.19, 0.083)
  drift(ctx, wash.source, 0.037, 0.008)

  // Individual crests. Their own bus so the whole sequence can be levelled at
  // once and ducked below decks with everything else.
  const breakers = ctx.createGain()
  breakers.gain.value = 0
  breakers.connect(hull)

  // --- The weather over it.

  // Wind. Near silent in light airs and the loudest thing here in a squall,
  // which is the owner's brief and also simply true: you do not hear wind on a
  // boat until it is blowing. The band climbs and narrows as it gets up, so a
  // squall does not merely get louder, it rises and tightens the way wind
  // across a deck does.
  const wind = voice(ctx, white, hull, 'bandpass', 420, 0.8, 1.07)
  const windSwell = swell(ctx, wind.gain.gain, 0.31, 0.127)
  drift(ctx, wind.source, 0.023, 0.01)

  // The rig: a narrow resonance up where standing rigging and halyards sing.
  // Silent until the wind is genuinely up — this is the sound of a boat being
  // pressed, and hearing it in a fair breeze would be a lie about the day.
  const rig = voice(ctx, white, hull, 'bandpass', 1900, 11, 1.13)

  // Rain, on the deck and on the water. Nearly white — rain is the one thing
  // out here with real high-frequency content.
  const rain = voice(ctx, white, hull, 'highpass', 1400, 0.6, 1.02)

  // Gulls go in ahead of the hull filter like everything else, so they muffle
  // properly when the camera goes below.
  const gulls = ctx.createGain()
  gulls.gain.value = 1
  gulls.connect(hull)

  let nextBreak = ctx.currentTime + 1.5
  let nextGull = ctx.currentTime + 4

  /** Ease a param toward a value. `setTargetAtTime` rather than a ramp: it needs
   *  no end time, so successive updates simply re-aim it and nothing has to be
   *  cancelled or scheduled against a frame rate that varies. */
  const ease = (param: AudioParam, value: number, seconds = 0.35) => {
    param.setTargetAtTime(value, ctx.currentTime, seconds)
  }

  function update(time: number, scene: SceneState, ducked: boolean) {
    const c = sampleConditions(time)
    const gust = windStrength(time)
    const below = scene === 'cabin'
    const env = below ? BELOW : ABOVE

    // Wind, with the gust on top of the weather's steady figure, then held off
    // until there is a breeze worth hearing. Squared after that, because
    // loudness against wind speed is nothing like linear: a linear map leaves a
    // fair day too noisy and a squall not frightening enough.
    const blow = clamp01(c.wind * (0.78 + 0.22 * gust))
    const heard = ramp(blow, 0.3, 1)

    ease(sea.gain.gain, lerp(0.1, 0.5, c.sea) * env.sea)
    ease(sea.filter.frequency, lerp(150, 430, c.sea), 0.8)
    ease(seaSwell.gain, lerp(0.03, 0.14, c.sea))

    ease(wash.gain.gain, (0.02 + 0.26 * c.foam + 0.14 * c.spray) * env.sea)
    ease(washSwell.gain, 0.05 + 0.2 * c.foam)

    ease(breakers.gain, lerp(0.35, 1.05, c.sea) * env.sea)

    ease(wind.gain.gain, (0.01 + 0.46 * heard * heard) * env.air)
    ease(wind.filter.frequency, lerp(300, 1020, blow), 0.5)
    ease(wind.filter.Q, lerp(0.7, 3.4, blow), 0.5)
    ease(windSwell.gain, 0.02 + 0.18 * heard)

    ease(rig.gain.gain, 0.22 * ramp(blow, 0.66, 1) * env.air)
    ease(rig.filter.frequency, lerp(1700, 2450, blow), 0.5)

    ease(rain.gain.gain, 0.34 * c.rain * env.rain)

    ease(hull.frequency, env.cutoff, 0.6)
    // Ducked while an exhibit is open: the panel is there to be read, and a
    // gale behind it is the reason people mute portfolio sites.
    ease(master.gain, MASTER * (ducked ? 0.35 : 1), 0.4)

    // --- Crests. The gap shortens and the size grows with the sea, and both
    // are jittered every time, so no two arrive on the same beat. This is
    // defence 4 and it is why the sea does not read as a texture.
    if (ctx.currentTime > nextBreak) {
      breaker(ctx, white, breakers, lerp(0.28, 1, c.sea) * between(0.55, 1))
      const gap = lerp(BREAK_GAP.calm, BREAK_GAP.rough, c.sea)
      nextBreak = ctx.currentTime + gap * between(0.45, 1.75)
    }

    // --- Gulls. They keep off the water in a blow, so their rate falls away as
    // the weather gets up and they are gone entirely in a squall — which is
    // also what makes them worth having: the silence where they were is a
    // second, quieter signal that the weather has turned.
    const gullChance = clamp01(1 - ramp(c.sea, 0.3, 0.72)) * (below ? 0.25 : 1)
    if (ctx.currentTime > nextGull) {
      if (gullChance > 0.02) {
        const end = gullCry(ctx, gulls, 0.2 * gullChance * env.air)
        nextGull = end + lerp(GULL_GAP.max, GULL_GAP.min, gullChance) * between(0.6, 1.4)
      } else {
        nextGull = ctx.currentTime + 6
      }
    }
  }

  function dispose() {
    for (const v of [sea, wash, wind, rig, rain]) {
      v.source.stop()
      v.source.disconnect()
      v.filter.disconnect()
      v.gain.disconnect()
    }
    breakers.disconnect()
    gulls.disconnect()
    hull.disconnect()
    master.disconnect()
    limiter.disconnect()
  }

  return { context: ctx, update, dispose }
}

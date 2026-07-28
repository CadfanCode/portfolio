import type { SceneState } from '../../state/useSceneStore'
import { sampleConditions } from '../conditions'
import { clamp01, lerp, ramp } from '../mathUtils'
import { windStrength } from '../wind'
import { makeNoise, noiseSource } from './noise'
import type { Noise } from './noise'

/**
 * The soundscape: the sea, the wind and the rain, generated rather than played
 * back.
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
 *   wash      band-passed white, rising and falling in sets — the sea's surface
 *   wind      band-passed white, near-silent below a real breeze
 *   rig       a narrow, high resonance that only speaks in a blow
 *   rain      high-passed white
 *
 * Every one of them is a *level*, continuous and weather-driven. There are no
 * one-shots left in this file — see "What came out" below, which is the reason
 * the anti-loop section has the shape it does.
 *
 * ## Not sounding like a loop
 *
 * Three defences, because ambience that repeats is worse than no ambience — an
 * ear locks onto a period in about two cycles and then cannot un-hear it.
 *
 *   1. The noise buffers are long (9 and 13 seconds) and crossfaded at the seam,
 *      so there is no click to hang a period on. See `noise.ts`.
 *   2. Their playback rates are *detuned by a slow LFO*, so even that period is
 *      not constant — the buffer never lines up with itself twice.
 *   3. Every continuous level rides the product of two oscillators at unrelated
 *      rates, whose combined period is longer than anyone will sit here. The
 *      sea's surface gets two such pairs rather than one — a faster breath and
 *      a very slow one — so it arrives in sets, the way a real sea does, and
 *      the two envelopes never line up twice.
 *
 * ## What came out
 *
 * Three voices have been cut from this file at the owner's request, and they
 * are worth recording because they failed for one reason between them: an ear
 * forgives a texture and does not forgive a rhythm.
 *
 *   sails     band-passed noise gated at a couple of hertz, for cloth working.
 *             A fast, regular tremolo on a fixed noise band is a chugging, and
 *             what it sounded like was an engine idling below decks.
 *   breakers  one-shot crests: a filter sweep and a decay, panned at random,
 *             scheduled more often as the sea got up. Individually convincing,
 *             but from a camera sitting on the boat they read as the sea
 *             hitting the hull — a knocking, at a rate the ear starts counting.
 *   gulls     one-shot cries, in fair weather only. The single most literal
 *             thing in the scene, and the first thing to sound like a sample
 *             library rather than a place.
 *
 * What replaces them is not another event source but *more movement in the
 * levels* — defence 3 above. The sea is carried by the wash's two swell pairs
 * swinging its gain across most of its range, so the surface still rises and
 * falls and still tracks the weather; it just never strikes anything.
 *
 * ## Below decks
 *
 * Coming below drops a low-pass across the whole bus and pulls the airborne
 * voices down hard. A cabin is a GRP box: what reaches you through it is the
 * hull rumbling and the water along the topsides, not the wind. That contrast
 * is most of what makes the companionway feel like a threshold.
 */

/** Where the whole bus sits before the limiter. */
const MASTER = 0.55

/** How much of each voice survives below decks, and how far the bus is filtered
 *  when it does. Sea and rain carry through a hull; wind does not, which is the
 *  whole point of the contrast. */
const BELOW = { cutoff: 520, sea: 0.62, rain: 0.3, air: 0.16 }
const ABOVE = { cutoff: 20000, sea: 1, rain: 1, air: 1 }

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

export function createSoundscape(ctx: AudioContext): Soundscape {
  // Long buffers. See "Not sounding like a loop" above: this is the first of
  // the three defences and the cheapest — a few megabytes of float that never
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

  // The general surface: the hiss of a sea that is up, and the water running
  // along the topsides. With the crests gone this is the sea's whole voice
  // above the swell, so it gets two swell pairs instead of one.
  //
  // `washBreath` is the near rate the old wash already had — the surface
  // working, seconds at a time. `washSets` is an order of magnitude slower, and
  // is the one doing the work the breakers used to: periods of about half a
  // minute and a minute and a half, multiplied, so the sea builds and eases off
  // in sets that never fall on the same beat twice. Both land on the same gain
  // and add, and between them they swing it across most of its range — which is
  // what keeps a level from reading as a texture now that nothing strikes.
  const wash = voice(ctx, white, hull, 'bandpass', 1250, 0.7, 0.93)
  const washBreath = swell(ctx, wash.gain.gain, 0.19, 0.083)
  const washSets = swell(ctx, wash.gain.gain, 0.037, 0.011)
  drift(ctx, wash.source, 0.037, 0.008)

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

  // Every voice is built at a gain of 0, so the graph can be constructed long
  // before anyone is meant to hear it and sits there silent until the first
  // `update`. That is what lets `engine.ts` build the whole thing during page
  // load without the scene making a sound before it is on screen.
  let primed = false

  /** Ease a param toward a value. `setTargetAtTime` rather than a ramp: it needs
   *  no end time, so successive updates simply re-aim it and nothing has to be
   *  cancelled or scheduled against a frame rate that varies.
   *
   *  The exception is the very first call. Easing from the constructed zero
   *  would fade the whole soundscape up over about a second *after* the world
   *  appears, which is heard as the sound arriving late — the thing this was
   *  built to avoid. So the first update snaps: by the time the boat is on
   *  screen the sea is already at the level that weather calls for. */
  const ease = (param: AudioParam, value: number, seconds = 0.35) => {
    if (primed) param.setTargetAtTime(value, ctx.currentTime, seconds)
    else param.setValueAtTime(value, ctx.currentTime)
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

    // The swell and the surface both carry more than they used to: the crests
    // were the loudest thing in the sea and taking them out left a hole, so the
    // two remaining voices are levelled up to fill it rather than leaving the
    // sea quieter than the wind over it.
    ease(sea.gain.gain, lerp(0.16, 0.66, c.sea) * env.sea)
    ease(sea.filter.frequency, lerp(150, 430, c.sea), 0.8)
    ease(seaSwell.gain, lerp(0.05, 0.2, c.sea))

    // Driven by `foam` alone. `spray` is the sea *against the hull* — the same
    // number that draws the splash at the bow — and keying the wash to it is
    // what made the surface swell every time the boat took a wave. What is left
    // is whitecaps on the open sea: a sound the weather makes, not the boat.
    ease(wash.gain.gain, (0.035 + 0.46 * c.foam) * env.sea)
    ease(washBreath.gain, 0.05 + 0.2 * c.foam)
    ease(washSets.gain, 0.03 + 0.22 * c.foam)

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

    primed = true
  }

  function dispose() {
    for (const v of [sea, wash, wind, rig, rain]) {
      v.source.stop()
      v.source.disconnect()
      v.filter.disconnect()
      v.gain.disconnect()
    }
    hull.disconnect()
    master.disconnect()
    limiter.disconnect()
  }

  return { context: ctx, update, dispose }
}

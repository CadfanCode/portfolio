import type { SceneState } from '../../state/useSceneStore'
import { sampleConditions } from '../conditions'
import { windStrength } from '../wind'
import { makeNoise, noiseSource } from './noise'
import type { Noise } from './noise'

/**
 * The soundscape: sea, wind, rain, the rig, the sails and the gulls, generated
 * rather than played back.
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
 * amplitude, the heel, the fog and the sail shader's flutter. So the sound
 * cannot disagree with what is on screen: the sea gets loud because it is the
 * same number that made it rough, and the rigging starts to whine in a squall
 * because it is the number that is already thrashing the cloth. Cross-fading
 * recorded loops against the weather would approximate this and drift.
 *
 * And it is free. The boat is a 6.7 MB GLB. A usable set of seamless ambience
 * loops — sea, wind, rain, gulls — is several megabytes more, and they loop
 * audibly. This is a few hundred bytes of code and a couple of noise buffers
 * built at runtime.
 *
 * ## The voices
 *
 * Six continuous ones, each a filtered noise source with its own gain, plus the
 * gulls, which are scheduled one-shots. Nothing here is a sound effect triggered
 * by an event; they are all always running, and what changes is their level and
 * their filter. That is what makes the weather audible as weather rather than as
 * a series of cues.
 *
 *   swell   brown noise, low-passed — the bed under everything
 *   wash    band-passed white, slowly gated — crests breaking, water on the hull
 *   wind    band-passed white, its band riding the gust
 *   rig     a narrow, high resonance that only speaks in a real blow
 *   sails   band-passed white, gated fast — cloth working
 *   rain    high-passed white
 *
 * ## Below decks
 *
 * Coming below drops a low-pass across the whole bus and pulls the airborne
 * voices down hard. A cabin is a GRP box: what reaches you through it is the
 * hull rumbling and the water against the topsides, not the wind or the gulls.
 * That contrast is most of what makes the companionway feel like a threshold.
 */

/** Where each voice's own gain sits before the master. Tuned against each other
 *  rather than absolutely — the master is what sets how loud the scene is. */
const MASTER = 0.55

/** How much of each voice survives below decks, and how far the bus is filtered
 *  when it does. Sea and rain carry through a hull; wind, cloth and birds do
 *  not, which is the whole point of the contrast. */
const BELOW = {
  cutoff: 520,
  sea: 0.62,
  rain: 0.30,
  air: 0.16,
}
const ABOVE = { cutoff: 20000, sea: 1, rain: 1, air: 1 }

/** Seconds between gull cries, at their most and least likely. */
const GULL_GAP = { min: 7, max: 34 }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Ramp that stays at 0 until `lo`, reaching 1 at `hi` — the same shape
 *  `conditions.ts` uses, and for the same reason: some things do not begin at
 *  all until the weather is genuinely up. */
const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo))

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
 * the shape of real wind and would also be two allocations, two more nodes in
 * the graph, and a difference nobody hears under a boat's worth of other noise.
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
 * One gull, some distance off.
 *
 * A cry is three to five short notes, each a fast rise and a longer fall in
 * pitch, through a band-pass that stands in for the bird's own resonance. A
 * sawtooth rather than a sine because a gull is a rough, buzzy sound and the
 * harmonics are most of what makes it recognisable at all.
 *
 * Built and thrown away per cry rather than kept: it plays for under two
 * seconds, a handful of times a minute at most, and holding a permanent voice
 * for it would mean gating an oscillator that is silent 95% of the time.
 */
function gullCry(ctx: AudioContext, dest: AudioNode, level: number): number {
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.random() * 1.6 - 0.8
  panner.connect(dest)

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1500 + Math.random() * 700
  band.Q.value = 1.3
  band.connect(panner)

  const notes = 3 + Math.floor(Math.random() * 3)
  // Further off means quieter and duller — one number doing both, so a distant
  // bird cannot come out muffled and loud.
  const distance = 0.35 + Math.random() * 0.65
  band.frequency.value *= 0.75 + 0.25 * distance

  let at = ctx.currentTime + 0.05
  for (let i = 0; i < notes; i++) {
    const length = 0.15 + Math.random() * 0.1
    const base = (760 + Math.random() * 240) * (1 - i * 0.06)

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

    at += length + 0.09 + Math.random() * 0.08
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
  const white = makeNoise(ctx, 4.5, 0)
  const brown = makeNoise(ctx, 6.0, 1)

  // --- The bus. Everything lands here, gets the hull's low-pass if the camera
  // is below decks, then the master level, then a limiter.
  //
  // The limiter is not decoration: in a squall the sea, the wind, the rig, the
  // rain and the cloth are all at their loudest at once, by construction —
  // they are one weather. Without it their sum clips, and clipping is the one
  // artefact that will not read as "rough weather" but as "broken website".
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

  // --- The voices.

  // The swell: brown noise with most of the top taken off. This is the floor of
  // the whole scene and the only voice that is never silent — even a glassy day
  // has water moving under the boat.
  const sea = voice(ctx, brown, hull, 'lowpass', 220, 0.8, 1.0)
  const seaSwell = swell(ctx, sea.gain.gain, 0.075, 0.041)

  // Crests breaking, and the wash running along the topsides. Gated slowly and
  // irregularly, because waves arrive one at a time; the band sits where water
  // actually hisses rather than where it rumbles.
  const wash = voice(ctx, white, hull, 'bandpass', 1250, 0.7, 0.93)
  const washSwell = swell(ctx, wash.gain.gain, 0.19, 0.083)

  // Wind. The band climbs and narrows with the gust, so a squall does not just
  // get louder, it rises in pitch and tightens the way wind across a deck does.
  const wind = voice(ctx, white, hull, 'bandpass', 420, 0.8, 1.07)

  // The rig: a narrow resonance up where standing rigging and halyards sing.
  // Silent until the wind is genuinely up — this is the sound of a boat being
  // pressed, and hearing it in a fair breeze would be a lie about the day.
  const rig = voice(ctx, white, hull, 'bandpass', 1900, 11, 1.13)

  // Cloth working: the luff and the leech. Gated much faster than the sea, at a
  // rate that rises with how hard the sails are being worked, so it goes from a
  // slow breathing rustle to a hard flogging.
  const sails = voice(ctx, white, hull, 'bandpass', 900, 1.1, 0.87)
  const sailFlap = swell(ctx, sails.gain.gain, 1.7, 0.9)

  // Rain, on the deck and on the water. Nearly white — rain is the one thing
  // out here with real high-frequency content.
  const rain = voice(ctx, white, hull, 'highpass', 1400, 0.6, 1.02)

  // Gulls go in ahead of the hull filter like everything else, so they muffle
  // properly when the camera goes below.
  const gulls = ctx.createGain()
  gulls.gain.value = 1
  gulls.connect(hull)

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

    // The same two lines `Boat.tsx` computes to drive the sail shader, so the
    // cloth is heard working exactly as hard as it is seen working.
    const intensity = clamp01(0.6 * c.sea + 0.4 * c.wind)
    const flutter = clamp01(0.1 + 0.45 * intensity + 0.4 * c.spray + 0.35 * ramp(c.wind, 0.6, 1))

    // Wind, with the gust on top of the weather's steady figure. Squared,
    // because loudness against wind speed is nothing like linear and a linear
    // map leaves a calm too noisy and a squall not frightening enough.
    const blow = clamp01(c.wind * (0.78 + 0.22 * gust))

    ease(sea.gain.gain, lerp(0.09, 0.5, c.sea) * env.sea)
    ease(sea.filter.frequency, lerp(150, 420, c.sea), 0.8)
    ease(seaSwell.gain, lerp(0.03, 0.14, c.sea))

    ease(wash.gain.gain, (0.03 + 0.34 * c.foam + 0.16 * c.spray) * env.sea)
    ease(washSwell.gain, 0.05 + 0.22 * c.foam)

    ease(wind.gain.gain, (0.02 + 0.36 * blow * blow) * env.air)
    ease(wind.filter.frequency, lerp(300, 980, blow), 0.5)
    ease(wind.filter.Q, lerp(0.7, 3.2, blow), 0.5)

    ease(rig.gain.gain, 0.2 * ramp(blow, 0.66, 1) * env.air)
    ease(rig.filter.frequency, lerp(1700, 2450, blow), 0.5)

    ease(sails.gain.gain, (0.02 + 0.2 * flutter) * env.air)
    ease(sailFlap.gain, 0.02 + 0.2 * flutter)
    // How fast the cloth is working, not how loud. A sail breathing in a calm
    // and one flogging in a squall are the same band at the same level for the
    // first half-second; the rate is what tells them apart.
    ease(sails.filter.frequency, lerp(700, 1350, flutter), 0.5)

    ease(rain.gain.gain, 0.34 * c.rain * env.rain)

    ease(hull.frequency, env.cutoff, 0.6)
    // Ducked while an exhibit is open: the panel is there to be read, and a
    // gale behind it is the reason people mute portfolio sites.
    ease(master.gain, MASTER * (ducked ? 0.35 : 1), 0.4)

    // --- Gulls. They keep off the water in a blow, so their rate falls away as
    // the weather gets up and they are gone entirely in a squall — which is
    // also what makes them worth having: the silence where they were is a
    // second, quieter signal that the weather has turned.
    const gullChance = clamp01(1 - ramp(c.sea, 0.3, 0.72)) * (below ? 0.25 : 1)
    if (gullChance > 0.02 && ctx.currentTime > nextGull) {
      const end = gullCry(ctx, gulls, 0.2 * gullChance * env.air)
      nextGull = end + lerp(GULL_GAP.max, GULL_GAP.min, gullChance) * (0.6 + Math.random() * 0.8)
    } else if (ctx.currentTime > nextGull) {
      nextGull = ctx.currentTime + 6
    }
  }

  function dispose() {
    for (const v of [sea, wash, wind, rig, sails, rain]) {
      v.source.stop()
      v.source.disconnect()
      v.filter.disconnect()
      v.gain.disconnect()
    }
    gulls.disconnect()
    hull.disconnect()
    master.disconnect()
    limiter.disconnect()
  }

  return { context: ctx, update, dispose }
}

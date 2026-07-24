import { Color } from 'three'

/**
 * The weather — the single drifting source of truth for what kind of day it is,
 * the way `waves.ts` is the one sea and `wind.ts` the one wind. Sea state, sky,
 * sun, fog, rain, the press on the sails and the spray off the bow are all read
 * from here, so they cannot disagree: a big sea always comes with the wind and
 * cloud and rain that raised it, because they are one number's worth of weather
 * resolved into all of them.
 *
 * It drifts on its own — no control, no input. Like a front coming through, the
 * scene eases from a flat calm under clear sky, up through a fair breeze to an
 * overcast chop, into a rain squall, then wrings out into fog and clears again.
 * The whole cycle takes minutes, so at any one visit the weather is doing
 * something without ever obviously repeating.
 *
 * The design is the same split `sails.py` uses: a small set of primary knobs
 * that an author sets per preset — how big the sea, how hard the wind, how much
 * cloud, fog and rain — and everything else *derived* from those in `resolve`,
 * so foam grows with the sea and the sun dims with the cloud without anyone
 * having to keep two dozen numbers in agreement by hand.
 */

/** The knobs an author actually sets. Everything visible is derived from these. */
type Preset = {
  name: string
  /** Sea roughness, 0 glassy … 1 storm. Drives wave height, chop, foam, spray. */
  sea: number
  /** Steady wind, 0 … 1. Heels the boat and presses the sails. */
  wind: number
  /** Sky cover, 0 clear … 1 heavy overcast. Dims and greys the sun and sky. */
  cloud: number
  /** Fog, 0 clear … 1 socked in. */
  fog: number
  /** Rain, 0 dry … 1 downpour. */
  rain: number
}

/**
 * The passing front, as an ordered timeline of presets. The scene eases from one
 * to the next and holds briefly, then moves on; the last wraps back to the first,
 * so it loops seamlessly. Order tells a small story — it builds, it breaks, it
 * clears — rather than jumping between unrelated skies.
 */
const TIMELINE: Preset[] = [
  // Opens on a fair sailing breeze — a representative sea at its best — then
  // builds to the squall, clears, fogs, and falls to a flat calm before the
  // breeze fills in again and the loop closes.
  { name: 'fair-breeze', sea: 0.36, wind: 0.58, cloud: 0.28, fog: 0.0, rain: 0.0 },
  { name: 'overcast-chop', sea: 0.62, wind: 0.78, cloud: 0.85, fog: 0.08, rain: 0.0 },
  { name: 'squall', sea: 0.95, wind: 1.0, cloud: 1.0, fog: 0.22, rain: 1.0 },
  { name: 'clearing', sea: 0.55, wind: 0.6, cloud: 0.7, fog: 0.12, rain: 0.15 },
  { name: 'fog', sea: 0.16, wind: 0.28, cloud: 0.55, fog: 1.0, rain: 0.0 },
  { name: 'calm-clear', sea: 0.12, wind: 0.3, cloud: 0.05, fog: 0.0, rain: 0.0 },
]

/** Seconds the scene dwells at each preset before easing to the next. */
const DWELL = 26
/** Seconds spent easing from one preset to the next. */
const FADE = 16
const SEGMENT = DWELL + FADE

/** All-derived conditions, resolved for a moment in time. */
export type Conditions = {
  name: string
  wind: number
  /** Raw sea state, 0 glassy … 1 storm — the calm→rough→squall axis. Passed
   *  through so the sails' liveliness can scale with it (see `Boat.tsx`). */
  sea: number
  /** Amplitude multiplier on the base sea in `waves.ts`. */
  seaAmp: number
  /** Steepness (choppiness) multiplier on the base sea. */
  seaChop: number
  /** Whitecap foam on the open sea, 0 … 1. */
  foam: number
  /** Splash and wash where the sea meets the hull, 0 … 1. */
  spray: number
  cloud: number
  /** `FogExp2` density. */
  fogDensity: number
  rain: number
  /** Directional sun strength. */
  sunIntensity: number
  sun: Color
  /** Hemisphere fill strength — flatter, higher under cloud. */
  ambient: number
  skyTurbidity: number
  skyRayleigh: number
  skyMie: number
  /** How far the drei Sky is greyed toward overcast, 0 … 1. */
  overcast: number
  /** Opacity of the cloud/overcast dome over the sky: 0 clear, broken at
   *  mid values, solid once truly overcast or foggy. */
  haze: number
  /** Raw fog knob, 0 … 1 — how far the haze fills in solid vs. stays broken. */
  fogFill: number
  /** Colour of the fog / distance haze, matched to the sky it fades into. */
  fog: Color
}

// Scratch colours, reused each resolve so a per-frame sample allocates nothing.
const _sun = new Color()
const _fog = new Color()

// Sun colours to interpolate between: warm and bright in the clear, flat cold
// grey under a storm.
const SUN_CLEAR = new Color('#fff4e6')
const SUN_STORM = new Color('#9aa3ad')
// Fog / horizon haze: a clean pale blue when fair, a wet slate under cloud, a
// near-white when it is truly foggy.
const FOG_FAIR = new Color('#cfdae4')
const FOG_STORM = new Color('#6b7178')
const FOG_THICK = new Color('#c3c8cc')

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (t: number) => t * t * (3 - 2 * t)
/** Ramp that stays at 0 until `lo`, reaching 1 at `hi`. */
const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo))

/**
 * Turn the primary knobs into everything the scene draws. This is where the
 * coupling lives: every rule that says "rougher seas foam more" or "cloud kills
 * the sun" is one line here, applied once, so the look stays coherent across the
 * whole drift instead of being re-guessed in each consumer.
 */
function resolve(p: Preset): Conditions {
  const { sea, wind, cloud, fog, rain } = p

  // A wet, dim scalar the sky and sun both bend to: cloud, deepened by rain.
  const gloom = clamp01(cloud * 0.8 + rain * 0.5)

  _sun.copy(SUN_CLEAR).lerp(SUN_STORM, gloom)

  // Fog colour tracks the sky: fair blue → storm slate under cloud, then toward
  // a pale near-white as real fog closes in.
  _fog.copy(FOG_FAIR).lerp(FOG_STORM, gloom).lerp(FOG_THICK, fog)

  return {
    name: p.name,
    wind,
    sea,

    // Sea: a glassy day is ~0.15× the reference swell, a storm ~2.6×; the chop
    // (Gerstner steepness) sharpens too, so big seas peak rather than just
    // swelling. Foam and spray hold off until the sea is genuinely up, then
    // climb — a calm sea has no whitecaps and a boat sitting quietly throws no
    // spray.
    seaAmp: lerp(0.15, 2.6, sea),
    seaChop: lerp(0.55, 1.2, sea),
    foam: ramp(sea, 0.28, 1.0) * lerp(0.5, 1.0, sea),
    spray: ramp(sea, 0.32, 1.0),

    cloud,
    // Fog density: a touch of aerial haze always, thickening a little with
    // cloud, and dominated by the fog knob when a real fog is called for.
    fogDensity: 0.0016 + cloud * 0.004 + fog * 0.05,
    rain,

    // Sun: full and warm in the clear, guttering to a dim grey disc under a
    // storm. Rain pulls it down further.
    sunIntensity: lerp(2.8, 0.35, gloom),
    sun: _sun,
    // Overcast raises the ambient fill (an overcast sky is one big soft light)
    // even as the sun that casts shadows dies.
    ambient: lerp(0.5, 1.05, cloud),

    // The drei Sky's own knobs: more turbid and less Rayleigh-blue under cloud,
    // so even before the overcast greying it reads hazier.
    skyTurbidity: lerp(3.5, 12.0, cloud),
    skyRayleigh: lerp(1.5, 0.5, cloud),
    skyMie: lerp(0.005, 0.02, cloud),
    overcast: gloom,
    // The dome over the sky: broken cloud at mid gloom, filling solid as a real
    // overcast or fog closes in.
    haze: clamp01(gloom * 0.85 + fog),
    fogFill: fog,

    fog: _fog,
  }
}

// A dev-only override: `?cond=squall` (or any preset name) freezes the weather
// at that preset instead of drifting, so a single state can be looked at without
// waiting minutes for the cycle to reach it. Read once; absent in production.
const OVERRIDE = (() => {
  if (typeof window === 'undefined') return null
  const name = new URLSearchParams(window.location.search).get('cond')
  if (!name) return null
  const preset = TIMELINE.find((p) => p.name === name)
  if (!preset && import.meta.env.DEV) {
    console.warn(`[conditions] unknown ?cond=${name}; options: ${TIMELINE.map((p) => p.name).join(', ')}`)
  }
  return preset ?? null
})()

// Scratch preset the drift blends into, so sampling allocates nothing per frame.
const _blend: Preset = { name: '', sea: 0, wind: 0, cloud: 0, fog: 0, rain: 0 }

/**
 * The weather at a moment. Blends the two presets the drift is currently between
 * — or returns the frozen override — then resolves the result. Cheap enough
 * (a handful of lerps) that every consumer can call it directly each frame, the
 * way the sea and wind are already sampled independently.
 */
export function sampleConditions(time: number): Conditions {
  if (OVERRIDE) return resolve(OVERRIDE)

  const cycle = TIMELINE.length * SEGMENT
  const t = ((time % cycle) + cycle) % cycle
  const index = Math.floor(t / SEGMENT)
  const local = t - index * SEGMENT

  const a = TIMELINE[index]
  const b = TIMELINE[(index + 1) % TIMELINE.length]
  // Hold through the dwell, then ease across the fade.
  const k = local <= DWELL ? 0 : smooth((local - DWELL) / FADE)

  _blend.name = k < 0.5 ? a.name : b.name
  _blend.sea = lerp(a.sea, b.sea, k)
  _blend.wind = lerp(a.wind, b.wind, k)
  _blend.cloud = lerp(a.cloud, b.cloud, k)
  _blend.fog = lerp(a.fog, b.fog, k)
  _blend.rain = lerp(a.rain, b.rain, k)
  return resolve(_blend)
}

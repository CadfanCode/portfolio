/**
 * The wind — a single gentle, gusting value the whole scene reads, the way
 * `waves.ts` is the single sea. It drives three things that must agree: how far
 * the boat heels, how hard the sails are pressed, and how much they stir. Wind
 * and sea are what "reacting dynamically" means here, done as shared parameters
 * rather than a solver (CLAUDE.md: fake cheap effects over simulation).
 *
 * Deliberately not a physics model. A real gust would ramp the apparent wind,
 * luff the sail, then heel the boat a beat later; this fakes that coupling by
 * lagging nothing and simply reading the same smooth gust curve everywhere, so
 * the heel and the sail-stir move together and look caused by the same air.
 */

/** Steady breeze, before gusts. 0…1. */
const BASE = 0.62

/** How hard the strongest gust presses over the base. */
const GUST = 0.34

/** Full-strength heel, radians. About 9°, a boat pressed hard but not rail-down;
 *  scaled by the weather's wind so a calm sits upright and a blow leans on. */
const MAX_HEEL = 0.16

/**
 * Wind strength at a time, 0…1. Two slow sine terms at unrelated rates give an
 * irregular gust rhythm that never quite repeats, without any noise to seed.
 */
export function windStrength(time: number): number {
  const gust = 0.5 + 0.32 * Math.sin(time * 0.21) + 0.18 * Math.sin(time * 0.57 + 1.3)
  return Math.min(1, Math.max(0, BASE + GUST * (gust - 0.5) * 2))
}

/**
 * How far the boat heels, radians, for a given steady wind (0…1, from the
 * weather) at a time. The boat is sailing close-hauled on starboard tack — wind
 * over the starboard side, sails eased to port (see `sails.py`) — so it leans to
 * port, its lee side. That is a positive rotation about +Z here, the same axis
 * the wave roll uses, so the two just add.
 *
 * The lean tracks the weather's wind — upright in a calm, hard over in a blow —
 * with a little of the fast gust on top, so the boat leans to the average and
 * stiffens against the rest rather than following every flap.
 */
export function heelAngle(windLevel: number, time: number): number {
  return MAX_HEEL * windLevel * (0.85 + 0.15 * windStrength(time))
}

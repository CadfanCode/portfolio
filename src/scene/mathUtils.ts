/**
 * Small numeric helpers shared by anything that derives a look or a sound from
 * the drifting weather (`conditions.ts`, `soundscape.ts`, `Boat.tsx`'s sail
 * shader uniforms). Kept in one place so the easing curve is one decision, not
 * three copies that can quietly drift apart.
 */

/** Clamp to [0, 1]. */
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Linear interpolation from `a` to `b` at `t`. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Cubic ease: 0 at t=0, 1 at t=1, flat tangent at both ends. */
export const smoothstep01 = (t: number) => t * t * (3 - 2 * t)

/** Ramp that stays at 0 until `lo`, reaching 1 at `hi`, clamped outside that range. */
export const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo))

/** GLSL-style smoothstep: an eased ramp between `edge0` and `edge1`. */
export const smoothstep = (edge0: number, edge1: number, x: number) => smoothstep01(ramp(x, edge0, edge1))

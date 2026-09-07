// Seeded randomness for the archipelago. Every island and every scattered pine
// must land in exactly the same place on every load and every machine, so
// nothing here may touch Math.random.

/** Mulberry32. Small, fast, good enough, and reproducible across engines. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a lattice point to [-1, 1]. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return (((h ^ (h >>> 14)) >>> 0) / 2147483648) - 1
}

/** Quintic smoothstep. C2-continuous, which is what keeps the rock smooth. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Bilinear value noise. Low frequency in, rounded whalebacks out — which is
 * exactly the shape glaciers left on Baltic granite.
 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  const v = top + (bottom - top) * fy
  return Math.max(-1, Math.min(1, v))
}

/** Summed octaves, normalised back into [-1, 1]. */
export function fbm2D(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seed + i) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  const v = sum / norm
  return Math.max(-1, Math.min(1, v))
}

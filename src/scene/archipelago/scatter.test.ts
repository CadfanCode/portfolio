import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildIsland, type IslandDef } from './island'
import { AUTHORED_PROPS, ISLAND_DRESSING } from './layout'
import { PROP_KINDS, scatterLayer } from './scatter'
import type { Placement, PropKind, ScatterLayer } from './scatter'

const DEF: IslandDef = {
  id: 'test', tier: 'mid', centre: [0, 0],
  a: 60, b: 40, rotation: 0, height: 12, seed: 42,
}
const SURFACE = buildIsland(DEF, 64)

/**
 * A pine layer equivalent to the old dedicated `scatterPines` helper, used
 * to re-point its tests at the general `scatterLayer` now that the helper
 * itself is gone — see `scatter.ts`. Kept local to this file rather than
 * revived as production code: `layout.ts`'s `TREELINE_KINDS` is the one
 * real pine mix now, and this exists only to keep the old invariants tested
 * against the machinery that still implements them.
 */
const PINE_LAYER: ScatterLayer = {
  kinds: [
    { kind: 'pine_stunted', weight: 0.15, lowGroundWeight: 0.65 },
    { kind: 'pine_a', weight: 0.425, lowGroundWeight: 0.175 },
    { kind: 'pine_b', weight: 0.425, lowGroundWeight: 0.175 },
  ],
  count: 0,
  seed: 0,
  // The test suite asserts a spacing greater than 3.0 m; 3.5 leaves headroom
  // so the assertion never trips on a near-miss from floating point.
  minSpacing: 3.5,
  // Height above sea level below which nothing grows: the splash zone. An
  // absolute band in metres, not a fraction of the island's height, because
  // that is what sets it in reality — how far spray and winter ice reach up
  // the rock depends on the sea, not on how tall the land behind it happens
  // to be. See `layout.ts`'s `SHORE_BAND_M` for the production value this
  // pins.
  minHeight: 1.2,
  maxHeight: Infinity,
  maxSlope: 0.6,
  scaleRange: [0.75, 1.35],
}

/** `PINE_LAYER` with `count` and `seed` filled in — every old `scatterPines`
 *  call site passed both explicitly, so the tests below do too. */
function scatterPines(count: number, seed: number): Placement[] {
  return scatterLayer(SURFACE, DEF, { ...PINE_LAYER, count, seed })
}

describe('scatterLayer, pine mix', () => {
  it('is deterministic for a seed', () => {
    const a = scatterPines(40, 7)
    const b = scatterPines(40, 7)
    expect(a).toEqual(b)
  })

  it('places every pine on the island surface, not floating or buried', () => {
    for (const p of scatterPines(60, 3)) {
      const y = SURFACE.sampleAt(p.position[0], p.position[2])
      expect(y).not.toBeNull()
      expect(Math.abs(p.position[1] - (y as number))).toBeLessThan(0.01)
    }
  })

  it('keeps pines off the bare shore zone', () => {
    // Trees do not grow in the splash zone. That band is absolute — set by how
    // far spray and winter ice reach up the rock — not a fraction of the
    // island's height, so this asserts metres above sea level rather than a
    // proportion. As a proportion it kept every tree above 3.9 m on the mid
    // island and left a bare apron that read as a beach.
    for (const p of scatterPines(60, 3)) {
      expect(p.position[1]).toBeGreaterThan(1.0)
    }
  })

  it('respects a minimum spacing', () => {
    const ps = scatterPines(60, 3)
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].position[0] - ps[j].position[0]
        const dz = ps[i].position[2] - ps[j].position[2]
        expect(Math.hypot(dx, dz)).toBeGreaterThan(3.0)
      }
    }
  })

  it('never returns more than asked for', () => {
    expect(scatterPines(25, 5).length).toBeLessThanOrEqual(25)
  })

  it('returns nothing when asked for nothing', () => {
    expect(scatterPines(0, 5)).toEqual([])
  })

  it('varies scale and rotation so the treeline is not uniform', () => {
    const ps = scatterPines(40, 9)
    expect(new Set(ps.map((p) => p.scale)).size).toBeGreaterThan(5)
    expect(new Set(ps.map((p) => p.rotation)).size).toBeGreaterThan(5)
  })

  it('mixes the pine variants', () => {
    const kinds = new Set(scatterPines(60, 9).map((p) => p.kind))
    expect(kinds.size).toBeGreaterThan(1)
  })
})

const BOULDER_LAYER: ScatterLayer = {
  kinds: [{ kind: 'boulder_a', weight: 1 }],
  count: 40,
  seed: 11,
  minSpacing: 4,
  minHeight: 1,
  maxHeight: 8,
  maxSlope: 0.7,
  scaleRange: [0.8, 1.6],
}

describe('scatterLayer', () => {
  it('respects minSpacing within a layer', () => {
    const ps = scatterLayer(SURFACE, DEF, BOULDER_LAYER)
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].position[0] - ps[j].position[0]
        const dz = ps[i].position[2] - ps[j].position[2]
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(BOULDER_LAYER.minSpacing)
      }
    }
  })

  it('respects the avoid list', () => {
    const avoid: Placement[] = [{ kind: 'rock_stack', position: [5, 3, 5], rotation: 0, scale: 1 }]
    const ps = scatterLayer(SURFACE, DEF, BOULDER_LAYER, avoid)
    for (const p of ps) {
      const dx = p.position[0] - avoid[0].position[0]
      const dz = p.position[2] - avoid[0].position[2]
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(BOULDER_LAYER.minSpacing)
    }
  })

  it('respects the height band at both ends', () => {
    const layer: ScatterLayer = { ...BOULDER_LAYER, minHeight: 2, maxHeight: 5, count: 80 }
    const ps = scatterLayer(SURFACE, DEF, layer)
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      expect(p.position[1]).toBeGreaterThanOrEqual(2)
      expect(p.position[1]).toBeLessThanOrEqual(5)
    }
  })

  it('respects maxSlope', () => {
    const layer: ScatterLayer = { ...BOULDER_LAYER, maxSlope: 0.1, count: 80 }
    const ps = scatterLayer(SURFACE, DEF, layer)
    for (const p of ps) {
      expect(SURFACE.slopeAt(p.position[0], p.position[2])).toBeLessThanOrEqual(0.1)
    }
  })

  it('is deterministic for a seed, and differs for a different one', () => {
    const a = scatterLayer(SURFACE, DEF, BOULDER_LAYER)
    const b = scatterLayer(SURFACE, DEF, BOULDER_LAYER)
    expect(a).toEqual(b)

    const c = scatterLayer(SURFACE, DEF, { ...BOULDER_LAYER, seed: 12 })
    expect(c).not.toEqual(a)
  })

  it('biases toward the low-ground kind near the shore', () => {
    const layer: ScatterLayer = {
      kinds: [
        { kind: 'pine_a', weight: 0.9, lowGroundWeight: 0.05 },
        { kind: 'pine_stunted', weight: 0.1, lowGroundWeight: 0.95 },
      ],
      count: 200,
      seed: 21,
      minSpacing: 1,
      minHeight: 1,
      maxHeight: DEF.height,
      maxSlope: 1,
      scaleRange: [1, 1],
    }
    const ps = scatterLayer(SURFACE, DEF, layer)
    const low = ps.filter((p) => p.position[1] / DEF.height < 0.3)
    const high = ps.filter((p) => p.position[1] / DEF.height > 0.7)
    const lowStuntedFraction = low.filter((p) => p.kind === 'pine_stunted').length / low.length
    const highStuntedFraction = high.filter((p) => p.kind === 'pine_stunted').length / (high.length || 1)
    expect(lowStuntedFraction).toBeGreaterThan(highStuntedFraction)
  })

  it('every PropKind used in ISLAND_DRESSING and AUTHORED_PROPS is a declared kit name', () => {
    const usedKinds = new Set<PropKind>()
    for (const layers of Object.values(ISLAND_DRESSING)) {
      for (const layer of layers) {
        for (const k of layer.kinds) usedKinds.add(k.kind)
      }
    }
    for (const p of AUTHORED_PROPS) usedKinds.add(p.kind)

    for (const kind of usedKinds) {
      expect(PROP_KINDS).toContain(kind)
    }
  })
})

/**
 * `PROP_KINDS` is the single TypeScript declaration of the kit's part names,
 * but TypeScript can't see inside a binary asset — a kit rebuilt without a
 * part, or a rename on the Blender side, would still type-check. This reads
 * `archipelago-kit.glb`'s own glTF JSON chunk and checks its node names
 * against `PROP_KINDS` directly, the same failure mode that let pines and
 * houses go missing with no error before `kit.ts` existed.
 */
function readGlbNodeNames(path: string): Set<string> {
  const buffer = readFileSync(path)
  const GLB_JSON_CHUNK_TYPE = 0x4e4f534a // ASCII "JSON", little-endian
  let offset = 12 // past the 12-byte glTF header
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      const json = JSON.parse(buffer.toString('utf8', chunkStart, chunkStart + chunkLength)) as {
        nodes: { name?: string; mesh?: number }[]
      }
      return new Set(json.nodes.filter((n) => n.mesh !== undefined && n.name).map((n) => n.name as string))
    }
    offset = chunkStart + chunkLength
  }
  throw new Error(`no glTF JSON chunk found in ${path}`)
}

describe('PROP_KINDS', () => {
  it('matches the mesh node names actually baked into archipelago-kit.glb', () => {
    const kitPath = fileURLToPath(new URL('../../assets/models/archipelago-kit.glb', import.meta.url))
    const glbNames = readGlbNodeNames(kitPath)

    for (const kind of PROP_KINDS) {
      expect(glbNames, `"${kind}" is declared in PROP_KINDS but missing from the GLB`).toContain(kind)
    }
    for (const name of glbNames) {
      expect(PROP_KINDS as readonly string[], `"${name}" is a mesh node in the GLB but missing from PROP_KINDS`).toContain(name)
    }
  })
})

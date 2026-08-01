/**
 * How much of the scene to draw.
 *
 * The scene was authored for a strong desktop GPU: a 400 m ocean plane at 240
 * segments, a nine-pass post stack led by ambient occlusion at sixteen samples,
 * a 2048² shadow map rebuilt every frame over all 89 meshes of the boat. That is
 * the look, and on the hardware it was tuned for it should stay exactly that.
 * Everywhere else it has to come down, and this file is where by how much is
 * decided.
 *
 * One table, three columns. Every cost centre in the app reads its number from
 * here rather than testing the tier itself, so adding a knob is one line in each
 * of the three tiers and one line in the consumer — never a new `if (tier ===
 * 'low')` scattered through the scene. The same reasoning `conditions.ts` uses
 * for the weather: a data table plus resolution logic, read from everywhere,
 * owned in one place.
 *
 * The design rule that makes this tractable: *almost nothing is turned off, only
 * turned down*. The composer is always mounted, there is always an antialias
 * pass, there is always a shadow map, there is always bloom. Several of those
 * are load-bearing for the art direction in ways that are not obvious from the
 * frame time — see the notes on each field, and be careful before deciding one
 * of them is dead weight.
 *
 * The tier is resolved once, at import time, and never changes for the session.
 * That is deliberate: it means the effect composer is never recreated, the ocean
 * geometry is never rebuilt and materials never recompile mid-visit, so there is
 * no mid-scene hitch and no tier oscillation to defend against. Adaptation at
 * runtime is limited to device pixel ratio, which three.js handles natively —
 * see `QualityMonitor.tsx`.
 */

export type QualityTier = 'low' | 'medium' | 'high'

export type QualitySettings = {
  readonly tier: QualityTier

  /**
   * Ceiling for `<Canvas dpr>`; the floor is always 1.
   *
   * The largest single lever there is. Fill cost is quadratic in this number, so
   * a phone at `devicePixelRatio` 3 shades nine times the pixels of one clamped
   * to 1 — and it is a phone, so it has the least budget to do it with. R3F's
   * own default is `[1, 2]`, which is why an untouched Canvas punishes exactly
   * the hardware that can least afford it.
   */
  readonly dprMax: number

  readonly shadows: {
    /** `shadow-mapSize` on the sun. */
    readonly mapSize: number
    /**
     * R3F's `shadows` prop — which filter, not whether there are any. Soft (PCF
     * soft) is the prettiest and the most expensive; percentage (plain PCF) is
     * the sensible step down. There is no tier without shadows at all; see the
     * warning on `mapSize` below.
     */
    readonly filter: 'soft' | 'percentage'
    /**
     * Re-render the shadow map every Nth frame rather than every frame.
     *
     * The only thing that moves the shadows is the boat's roll and the sun's
     * drift, both of which are around 1 Hz. A map that is two or three frames
     * stale is invisible at 60 fps and costs a half or a third as much, because
     * the shadow pass currently re-renders all 89 meshes of the GLB into a depth
     * target every single frame. 1 means every frame, i.e. off.
     */
    readonly shadowInterval: number
  }

  readonly post: {
    /**
     * `EffectComposer multisampling` — MSAA on the composer's own HDR target.
     * 0 disables it. Note the Canvas itself runs with `antialias: false`, since
     * the composer renders offscreen and context MSAA would resolve a buffer
     * nothing samples.
     */
    readonly multisampling: number
    /**
     * Which resolve-time antialias runs. Never absent, on any tier.
     *
     * `Effects.tsx` is right that crawling specular on the thin rigging against a
     * bright sky is the loudest realtime tell there is, and MSAA does nothing
     * for specular aliasing. SMAA is a convolution effect and gets passes of its
     * own; FXAA is not, so the library merges it into the same `EffectPass` as
     * the tone mapping that has to exist anyway — which makes it very nearly
     * free, and the right choice at the bottom.
     */
    readonly aa: 'smaa' | 'fxaa'
    /**
     * N8AO's sample counts, or `null` to omit the pass entirely. The heaviest
     * thing in the stack by a wide margin, and the one real exception to the
     * turn-it-down-not-off rule: at the bottom tier the contact shadows are not
     * worth the frame.
     */
    readonly ao: {
      readonly aoSamples: number
      readonly denoiseSamples: number
      readonly denoiseRadius: number
    } | null
    /**
     * Bloom mipmap levels. Fewer is cheaper *and* a tighter glow, so this is a
     * visible change rather than a free one. Never dropped: the sun glint on the
     * water and on the stainless is the scene's signature.
     */
    readonly bloomLevels: number
    /**
     * Whether the cabin's depth of field runs. Already cabin-only, so this
     * changes nothing at the ocean and cockpit stops either way.
     */
    readonly dof: boolean
  }

  readonly ocean: {
    /**
     * `planeGeometry` segments per axis across the 400 m plane.
     *
     * Mind the floor here. The shortest Gerstner wave in `waves.ts` is 5.2 m, so
     * even 240 segments gives it only about three vertices across a crest; at
     * 150 the quads are 2.7 m and that wave is essentially gone, leaving a sea
     * that reads oily rather than choppy. 120 accepts that deliberately at the
     * bottom, but nothing above `low` should go below 180.
     */
    readonly segments: number
  }

  readonly sky: {
    /**
     * drei `<Environment resolution>`. Baked exactly once (drei's `frames`
     * defaults to 1), so this is VRAM and a one-off PMREM convolution, not a
     * per-frame cost — which is why it can drop hard without hurting frame time
     * much, and why it is worth dropping anyway on memory-starved phones.
     */
    readonly envResolution: number
  }

  readonly intro: {
    /**
     * How many of `introFlight.ts`'s seven `CLOUD_LAYERS` actually get a sheet.
     *
     * The intro is the heaviest frame budget in the whole app — seven 700×700
     * double-sided transparent planes, each running three four-octave fBm
     * evaluations — and it is also the first thing anyone sees, which is the
     * worst possible combination. Note that `introHaze()` keeps all seven
     * pulses regardless of this number, so the punch-through rhythm of the
     * descent survives with fewer sheets. Keep it at three or more; the
     * punch-throughs are the shot.
     */
    readonly cloudSheets: number
  }

  /**
   * Rain streaks. A small lever, because the rain is only on screen during the
   * squall, but the geometry is built up front either way.
   */
  readonly rainCount: number

  readonly textures: {
    /** Ceiling for `texture.anisotropy`, still clamped by the GPU's own maximum. */
    readonly anisotropy: number
    /**
     * Scale on the resume page canvases. 1 is the authored 1024×1448 across
     * eight pages — roughly 47 MB of RGBA VRAM, rasterised on the main thread
     * when the book is opened. Do not go below 0.5; the body text stops being
     * legible.
     */
    readonly pageScale: number
  }
}

const HIGH: QualitySettings = {
  tier: 'high',
  dprMax: 2,
  shadows: { mapSize: 2048, filter: 'soft', shadowInterval: 1 },
  post: {
    multisampling: 4,
    aa: 'smaa',
    ao: { aoSamples: 16, denoiseSamples: 4, denoiseRadius: 12 },
    bloomLevels: 8,
    dof: true,
  },
  ocean: { segments: 240 },
  sky: { envResolution: 512 },
  intro: { cloudSheets: 7 },
  rainCount: 1800,
  textures: { anisotropy: 8, pageScale: 1 },
}

const MEDIUM: QualitySettings = {
  tier: 'medium',
  dprMax: 1.5,
  shadows: { mapSize: 1024, filter: 'percentage', shadowInterval: 2 },
  post: {
    multisampling: 0,
    aa: 'smaa',
    ao: { aoSamples: 8, denoiseSamples: 2, denoiseRadius: 8 },
    bloomLevels: 6,
    dof: true,
  },
  ocean: { segments: 180 },
  sky: { envResolution: 256 },
  intro: { cloudSheets: 4 },
  rainCount: 900,
  textures: { anisotropy: 4, pageScale: 0.75 },
}

const LOW: QualitySettings = {
  tier: 'low',
  dprMax: 1,
  shadows: { mapSize: 512, filter: 'percentage', shadowInterval: 3 },
  post: {
    multisampling: 0,
    aa: 'fxaa',
    ao: null,
    bloomLevels: 4,
    dof: false,
  },
  ocean: { segments: 120 },
  sky: { envResolution: 128 },
  intro: { cloudSheets: 3 },
  rainCount: 500,
  textures: { anisotropy: 1, pageScale: 0.5 },
}

/**
 * The table.
 *
 * Module constants, so `QUALITY[tier]` and every sub-object hanging off it are
 * referentially stable for the life of the page. That is what lets consumers
 * subscribe with a plain selector — `useQualityStore((s) => s.settings.post)` —
 * without re-rendering on unrelated store writes, and it is why the sub-objects
 * are grouped the way they are rather than flattened.
 */
export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: LOW,
  medium: MEDIUM,
  high: HIGH,
}

/* -------------------------------------------------------------------------- */
/*  Detection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Software rasterisers and GPUs that will not hold a frame rate on this scene at
 * any sensible resolution. A match is decisive — it drops straight to `low`
 * without scoring, because no amount of core count makes llvmpipe viable.
 *
 * The mobile families listed are the older Adreno 5xx-and-below, the pre-Valhall
 * Malis and PowerVR; current Adreno 6xx/7xx and Mali-G are left to the score,
 * where the coarse-pointer and pixel-count penalties will usually place them at
 * `medium`.
 */
const WEAK =
  /SwiftShader|llvmpipe|Software|Microsoft Basic Render|Adreno \(TM\) [1-5]\d\d\b|Mali-(T|4|5|6|7)|PowerVR|Intel.*(HD|UHD) Graphics (5|6)\d\d/i

/** Discrete desktop parts and Apple Silicon — the hardware the look was tuned on. */
const STRONG = /RTX|GeForce (RTX|GTX)|Radeon (RX|Pro)|Apple M[1-9]|Arc A/i

type Probe = {
  webgl2: boolean
  /**
   * Unmasked renderer string, or `''` where the browser refuses to say. Absence
   * is not itself a bad signal — Firefox with `resistFingerprinting` and some
   * Safari builds mask it on perfectly strong machines — so the score falls
   * through to the hardware signals instead of penalising it.
   */
  renderer: string
  maxTextureSize: number
  cores: number
  /** `navigator.deviceMemory` in GB. Chromium only; `null` everywhere else. */
  memoryGB: number | null
  /** A phone or a tablet, near enough. */
  coarsePointer: boolean
  /** Physical pixels the compositor has to push at native DPR. */
  pixels: number
}

function probe(): Probe {
  const empty: Probe = {
    webgl2: false,
    renderer: '',
    maxTextureSize: 0,
    cores: 4,
    memoryGB: null,
    coarsePointer: false,
    pixels: 0,
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return empty

  let renderer = ''
  let maxTextureSize = 0
  let webgl2 = false

  // A throwaway context purely to ask the driver who it is. Browsers cap the
  // number of live WebGL contexts per page, so this one is explicitly killed
  // afterwards — leaking it risks the real Canvas failing to acquire one.
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const gl = canvas.getContext('webgl2')
    if (gl) {
      webgl2 = true
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      if (info) {
        renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '')
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    // A blocked or exhausted context tells us nothing; fall through to the
    // hardware signals rather than assuming the worst.
  }

  const nav = navigator as Navigator & { deviceMemory?: number }
  const dpr = window.devicePixelRatio || 1

  return {
    webgl2,
    renderer,
    maxTextureSize,
    cores: nav.hardwareConcurrency ?? 4,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    coarsePointer:
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    pixels: window.screen.width * dpr * window.screen.height * dpr,
  }
}

/**
 * Turn a probe into a tier.
 *
 * Additive rather than a decision tree, because no single signal is trustworthy
 * on its own: the renderer string is masked on two major browsers, `deviceMemory`
 * exists only on Chromium, and core count says nothing about the GPU. Summing
 * several weak signals degrades more gracefully than branching on any one of
 * them, and the two regex shortcuts above cover the cases where one signal
 * really is decisive.
 */
function score(p: Probe): QualityTier {
  // three r185 is WebGL2-only, so this machine cannot run the scene at all.
  // Nothing here will save it, but `low` at least gives it the best chance.
  if (!p.webgl2) return 'low'
  if (WEAK.test(p.renderer)) return 'low'

  let s = 0
  if (STRONG.test(p.renderer)) s += 2
  if (p.maxTextureSize >= 16384) s += 1
  if (p.maxTextureSize < 8192) s -= 2

  // Thresholds deliberately generous in the middle. Four to six cores is an
  // ordinary modern machine, not a weak one, and an early version of this that
  // penalised anything under eight put a perfectly capable AMD Renoir laptop on
  // the bottom tier. Only genuinely thin hardware is docked.
  if (p.cores >= 8) s += 1
  else if (p.cores <= 3) s -= 1

  // Chrome quantises `deviceMemory` to powers of two and caps it at 8, so 4 is a
  // wide bucket that plenty of real machines land in — it is not evidence of a
  // constrained device. Only the genuinely small get the penalty.
  if (p.memoryGB !== null) {
    if (p.memoryGB <= 2) s -= 1
    else if (p.memoryGB >= 8) s += 1
  }

  if (p.coarsePointer) s -= 1
  if (p.pixels > 4_000_000) s -= 1

  // Safari and Firefox mask the renderer string, which would otherwise leave an
  // M-series Mac — or worse, an iPad Pro — scoring like a budget Chromebook. They
  // miss the +2 that naming a strong part would have earned, and then take the
  // retina pixel penalty on top of it. Android and Windows report their renderer
  // honestly, so a machine that declines to say *and* has a 16K texture limit and
  // eight cores is Apple hardware, and that is worth crediting back.
  const masked = p.renderer === '' || /Apple/i.test(p.renderer)
  if (masked && p.maxTextureSize >= 16384 && p.cores >= 8) {
    // A tablet still has a tablet's thermal budget and a retina panel to fill, so
    // it gets half of what the desktop does: enough to clear `medium`, not enough
    // to reach `high`.
    s += p.coarsePointer ? 1 : 2
  }

  return s >= 3 ? 'high' : s >= 1 ? 'medium' : 'low'
}

const TIERS: readonly QualityTier[] = ['low', 'medium', 'high']

const isTier = (value: string): value is QualityTier =>
  (TIERS as readonly string[]).includes(value)

/**
 * A dev override: `?quality=low` (or `medium`, `high`, `auto`) pins the tier
 * instead of detecting it, so a single tier can be looked at without hunting for
 * the hardware to trigger it. `auto` is the same as omitting it. Read once;
 * mirrors the `?cond=` override in `conditions.ts`.
 *
 * This is the only override there is. There is deliberately no visitor-facing
 * quality control — a second floating button next to the sound toggle is a real
 * cost to an art-directed scene, and detection plus adaptive DPR should mean
 * nobody needs one.
 */
const OVERRIDE = (() => {
  if (typeof window === 'undefined') return null
  const name = new URLSearchParams(window.location.search).get('quality')
  if (!name || name === 'auto') return null
  if (isTier(name)) return name
  if (import.meta.env.DEV) {
    console.warn(`[quality] unknown ?quality=${name}; options: ${TIERS.join(', ')}, auto`)
  }
  return null
})()

/**
 * The tier this machine gets.
 *
 * Deliberately synchronous and side-effect-light: it opens one throwaway WebGL
 * context, reads a handful of `navigator` fields and returns in a millisecond or
 * two. That is what lets the store resolve it at import time, before
 * `createRoot().render()` runs — so the very first frame is already at the right
 * DPR with the right passes, and there is no flash of an over-ambitious scene on
 * a machine that cannot draw it.
 *
 * drei's `useDetectGPU` was the obvious alternative and is not used on purpose:
 * it suspends on a `fetch` of a benchmark table from unpkg.com, which means a
 * blank page until a third-party CDN answers and a permanently blank page behind
 * a strict CSP or an aggressive content blocker. A rough tier computed offline
 * beats an accurate one that may never arrive.
 */
export const resolveTier = (): QualityTier => {
  if (OVERRIDE) return OVERRIDE
  const p = probe()
  const tier = score(p)
  if (import.meta.env.DEV) {
    console.info(`[quality] ${tier}`, p)
  }
  return tier
}

import { create } from 'zustand'
import { QUALITY, resolveTier, type QualitySettings, type QualityTier } from '../scene/quality'

/**
 * How hard this machine is being asked to work.
 *
 * A store of its own for the same reason `useAudioStore` is one: two sides of
 * the Canvas need it. The tier decides construction-ish props on `<Canvas>`
 * itself — device pixel ratio, the shadow filter — while the settings it
 * resolves to are read from deep inside the render tree by the ocean, the post
 * stack and the lights.
 *
 * `tier` and `settings` are resolved once, at import time, and never change.
 * Everything that would be expensive to re-do mid-visit — recreating the effect
 * composer, rebuilding the 400 m ocean geometry, resizing the shadow map,
 * recompiling materials — is therefore something that simply never happens after
 * the first frame. The one thing that does move at runtime is `dprScale`, which
 * three.js resizes into cheaply and which R3F treats as a reactive prop.
 *
 * Note the deliberate absence of a `preference` field and any localStorage: this
 * scene has no visitor-facing quality control, only the `?quality=` dev override
 * that `quality.ts` reads. If one is ever added, it belongs here.
 */
type QualityStore = {
  /** Decided once by `resolveTier()`. Fixed for the session. */
  tier: QualityTier
  /**
   * `QUALITY[tier]`. Stored rather than derived through a selector, because
   * zustand v5 will loop on a selector that builds a fresh object on every read
   * — and consumers subscribe to sub-objects of this (`settings.post`,
   * `settings.shadows`), which are only referentially stable because the table
   * in `quality.ts` is made of module constants.
   */
  settings: QualitySettings
  /**
   * Runtime multiplier on `settings.dprMax`, driven by `QualityMonitor`. Always
   * quantised by `setDprScale` — see there for why that matters.
   */
  dprScale: number
  setDprScale: (scale: number) => void
  /**
   * Whether a `focus` close-up is open. Drives `selectDprCeiling` below, which
   * swaps the Canvas over to the close-up's own DPR budget for as long as this
   * is true — see `FocusQuality.tsx` for what sets it and why on entry rather
   * than on arrival.
   */
  closeUp: boolean
  setCloseUp: (next: boolean) => void
}

/** Coarsest steps that still leave somewhere useful to go between 0.5 and 1. */
const DPR_STEP = 0.25
const DPR_MIN = 0.5

const tier = resolveTier()

export const useQualityStore = create<QualityStore>((set) => ({
  tier,
  settings: QUALITY[tier],
  dprScale: 1,

  // Quantised, and set-only-on-change. `PerformanceMonitor` reports a continuous
  // factor several times a second; feeding that straight through would re-render
  // `SceneCanvas` on every report, and because R3F's Canvas re-applies all of its
  // props on every render, each of those would be a full `configure()` pass. In
  // quarter steps a whole session is a handful of re-renders instead.
  setDprScale: (scale) =>
    set((s) => {
      const next = Math.max(DPR_MIN, Math.round(scale / DPR_STEP) * DPR_STEP)
      return next === s.dprScale ? s : { dprScale: next }
    }),

  closeUp: false,

  // Set-only-on-change, in the same style as `setDprScale` above: `FocusQuality`
  // fires this from an effect keyed on `focus !== null`, and a no-op guard keeps
  // that from forcing a `SceneCanvas` re-render (and the full prop re-apply that
  // comes with it) on every unrelated store update.
  setCloseUp: (next) => set((s) => (next === s.closeUp ? s : { closeUp: next })),
}))

/**
 * The DPR ceiling `SceneCanvas` actually passes to `<Canvas dpr>`.
 *
 * A plain number rather than a tuple, and deliberately so: zustand's default
 * equality is reference equality, so a selector that returned `[floor, ceiling]`
 * would build a fresh array on every read and defeat the whole point of
 * subscribing narrowly (see `SceneCanvas.tsx`'s header on why that matters).
 * A primitive needs no custom equality function to be stable.
 */
export const selectDprCeiling = (s: QualityStore) =>
  s.closeUp ? s.settings.focus.dpr : s.settings.dprMax * s.dprScale

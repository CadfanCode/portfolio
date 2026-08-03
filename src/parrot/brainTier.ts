import { useQualityStore } from '../state/useQualityStore'

/**
 * Which brain the chat panel is allowed to offer.
 *
 * `'chat'` means the opt-in button in `ParrotChat.tsx` may appear at all — it
 * still costs the visitor a click and an ~880 MB download before anything
 * runs. `'scripted'` means it never appears, and the panel behaves exactly as
 * it did before this file existed.
 *
 * The bar for `'chat'` is deliberately desktop-only, and specifically
 * mobile-hostile, for two independent reasons rather than one:
 *
 * 1. Mobile WebGPU adapters — where they exist at all — report
 *    `maxStorageBufferBindingSize` and `maxBufferSize` an order of magnitude
 *    below a desktop discrete or integrated GPU. A quantised 1B model's
 *    largest weight tensors will not fit inside those limits even when the
 *    adapter itself is real and `requestAdapter()` succeeds, so this file
 *    checks the numbers rather than just the adapter's existence.
 * 2. iOS Safari enforces a hard per-tab memory ceiling (historically around
 *    1.5 GB, tighter on older devices) and does not degrade gracefully when
 *    a page crosses it — it silently reloads the tab. An ~880 MB model
 *    download plus KV cache plus the scene's own WebGL allocations is
 *    squarely in the zone that trips this, and losing the entire boat scene
 *    to a silent reload is a far worse visitor experience than simply never
 *    being offered a chat upgrade. `matchMedia('(pointer: fine)')` is used
 *    as the exclusion rather than a user-agent sniff because it is what
 *    actually correlates with the failure mode — a touch-primary device,
 *    regardless of browser or OS — and does not need updating as new phone
 *    models ship.
 */
export type BrainTier = 'chat' | 'scripted'

/** The model this session would load if it opts in. Exported and imported by
 *  `brains/webllm.ts` rather than written out in both places, so the id the
 *  VRAM check is sized against and the id actually requested cannot drift. */
export const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

/**
 * `MODEL_ID`'s VRAM requirement in MB, transcribed from WebLLM's own
 * `prebuiltAppConfig.model_list` (879.04 as of `@mlc-ai/web-llm@0.2.84`) and
 * rounded up.
 *
 * Deliberately a hardcoded constant rather than a lookup, even though the
 * lookup would be self-maintaining. Reading it from the package means
 * importing the package, and the only import available here is the dynamic one
 * — which fetches the whole 6 MB web-llm chunk (2.1 MB gzipped). This probe
 * runs when the chat panel *opens*, which is long before anyone has agreed to
 * download anything, so paying two megabytes to read one number would hand the
 * download to every visitor who so much as looks at the chat, which is exactly
 * the thing the opt-in exists to prevent.
 *
 * Rounded up rather than down so that if the figure does drift in a later
 * release, this errs toward excluding marginal hardware rather than admitting
 * it and failing mid-download. Re-check it when bumping the dependency; the
 * value lives in `prebuiltAppConfig.model_list.find(m => m.model_id === ...)`.
 */
const VRAM_REQUIRED_MB = 1024

const TIERS: readonly BrainTier[] = ['chat', 'scripted']

const isBrainTier = (value: string): value is BrainTier =>
  (TIERS as readonly string[]).includes(value)

/**
 * A dev override: `?parrot=chat` forces an attempt at the model brain even on
 * hardware that would otherwise score `scripted`, `?parrot=scripted` forces
 * the reverse, and `auto` (or the param's absence) runs the real checks.
 * Mirrors `quality.ts`'s `?quality=` override in every particular, including
 * the DEV-only warning on an unrecognised value — this exists for the same
 * reason: testing a tier without owning the exact hardware that triggers it.
 *
 * `chat` is a forced *attempt*, not a forced result: `resolveBrainTier` still
 * runs the WebGPU adapter query underneath it, so a browser with genuinely no
 * WebGPU at all still falls back to scripted regardless of the override.
 */
const OVERRIDE = (() => {
  if (typeof window === 'undefined') return null
  const name = new URLSearchParams(window.location.search).get('parrot')
  if (!name || name === 'auto') return null
  if (isBrainTier(name)) return name
  if (import.meta.env.DEV) {
    console.warn(`[parrot] unknown ?parrot=${name}; options: ${TIERS.join(', ')}, auto`)
  }
  return null
})()

/** Memoised, same idiom as `quality.ts`'s module-level tier resolution, but a
 *  promise rather than a value because the WebGPU adapter query is async —
 *  `requestAdapter()` cannot be answered synchronously the way a WebGL
 *  context probe can. Resolved lazily, on first call, rather than at module
 *  import time: importing this module must not itself trigger a GPU adapter
 *  request for every visitor, only for the ones who open the chat panel. */
let cached: Promise<BrainTier> | null = null

async function detect(): Promise<BrainTier> {
  // A forced 'scripted' short-circuits everything below — there is no reason
  // to spend a GPU adapter request on an answer the override already gives.
  if (OVERRIDE === 'scripted') return 'scripted'

  // `?parrot=chat` forces an *attempt*: it skips the pointer/memory/quality
  // gates below (the whole point is testing the flow without owning the
  // right hardware) but not the WebGPU adapter and VRAM checks that follow,
  // since those are the ones that determine whether the attempt can actually
  // succeed rather than just crash the download.
  const forced = OVERRIDE === 'chat'

  const nav = navigator as Navigator & { gpu?: GPU; deviceMemory?: number }

  if (!nav.gpu) return 'scripted'

  if (!forced) {
    // A coarse pointer means a phone or tablet regardless of what the
    // adapter itself reports — see the header comment for why this is
    // checked ahead of the (heavier) adapter request rather than after it.
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) {
      return 'scripted'
    }

    // Chromium-only; a device that declines to report is not penalised,
    // since absence is common on perfectly capable desktop Firefox and
    // Safari too.
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return 'scripted'

    // A machine already turned down to `low` should not also be asked to
    // run inference alongside the scene — the two budgets are the same GPU.
    const tier = useQualityStore.getState().settings.tier
    if (tier !== 'medium' && tier !== 'high') return 'scripted'
  }

  let adapter: GPUAdapter | null
  try {
    adapter = await nav.gpu.requestAdapter()
  } catch {
    // A rejected adapter request tells us nothing more than "no", same as a
    // null one — fall through to the same result rather than surfacing an
    // error for what is, from the visitor's side, just an absent feature.
    adapter = null
  }
  if (!adapter) return 'scripted'

  // Note there is no `import('@mlc-ai/web-llm')` here, on purpose — see
  // `VRAM_REQUIRED_MB`. Nothing in this file may reach the library, statically
  // or dynamically: this probe runs on chat open, and pulling the chunk here
  // would start a two-megabyte download for a visitor who has agreed to
  // nothing. The first byte of web-llm is fetched in `enableModel`, after the
  // click, and nowhere else.
  const requiredBytes = VRAM_REQUIRED_MB * 1024 * 1024

  const limits = adapter.limits
  if (limits.maxStorageBufferBindingSize < requiredBytes) return 'scripted'
  if (limits.maxBufferSize < requiredBytes) return 'scripted'

  return 'chat'
}

/** The tier this session gets, resolved once and cached for the life of the
 *  tab. Callers (`useParrotStore`'s `enableModel` gate) can await this as
 *  many times as they like — only the first call does any work. */
export function resolveBrainTier(): Promise<BrainTier> {
  cached ??= detect()
  return cached
}

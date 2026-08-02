import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm'
import { matchScripted, SCRIPTED_FALLBACK } from '../../content/parrot'
import { useQualityStore } from '../../state/useQualityStore'
import { MODEL_ID } from '../brainTier'
import type { ParrotBrain, Turn } from './types'

// The model id comes from `brainTier.ts`, which is also where the VRAM figure
// it is sized against lives. One definition, so the model the gate admits
// hardware for and the model actually requested cannot drift apart. Note that
// importing it costs nothing here: `brainTier.ts` deliberately pulls in none of
// `@mlc-ai/web-llm` itself.

/**
 * Everything the model needs to know, stated rather than left for it to
 * recall — a 1B-parameter model has no reliable knowledge of a specific
 * person's career and must not be asked to invent any. Every fact here also
 * appears in `content/resume.ts` and `content/parrot.ts`'s scripted answers,
 * so the model's answers can drift in tone but never in substance.
 */
const SYSTEM_PROMPT = `You are Skipper, a ship's parrot aboard a Maxi 77 sailboat that is Cai Birch's interactive portfolio. Cai is a Java/Kotlin developer based in Stockholm, reachable at caiowain@gmail.com. His CV is the book on the shelf below decks. The project exhibits elsewhere on the boat are not built yet. Answer in at most two short sentences, in character as a salty, dry-witted parrot. If you don't know something about Cai, say so plainly rather than inventing an answer.`

const MAX_TOKENS = 120

/** Loaded lazily by `create()`, never at module scope — importing this file
 *  must not pull `@mlc-ai/web-llm` into whatever bundle reaches it. */
let engine: MLCEngineInterface | null = null

/** Set once `create()` has irrecoverably failed, so every question after the
 *  first failure goes straight to scripted without a second doomed attempt
 *  at spinning up the engine. */
let disabled = false

type Progress = {
  onProgress: (report: InitProgressReport) => void
}

/**
 * Creates the WebLLM brain and starts the model download/compile. Exported
 * as a function rather than a ready-made `ParrotBrain` because the caller
 * (`useParrotStore`'s `enableModel`) needs the init-progress callback wired
 * in before the engine is created, not after — `CreateWebWorkerMLCEngine`
 * reports progress during its own call, not via a separately attached
 * listener.
 */
export async function createWebllmBrain({ onProgress }: Progress): Promise<ParrotBrain> {
  const webllm = await import('@mlc-ai/web-llm')

  const worker = new Worker(new URL('../webllm.worker.ts', import.meta.url), {
    type: 'module',
  })

  engine = await webllm.CreateWebWorkerMLCEngine(worker, MODEL_ID, {
    initProgressCallback: onProgress,
  })
  disabled = false

  return webllmBrain
}

const webllmBrain: ParrotBrain = {
  id: 'webllm',
  label: 'Llama 3.2, running on your machine',

  async *ask(question: string, history: readonly Turn[]): AsyncIterable<string> {
    // Scripted answers still win: they are exact, they cost nothing, and a
    // 1B model asked the same question would only paraphrase them worse.
    const scripted = matchScripted(question)
    if (scripted !== null) {
      yield scripted
      return
    }

    if (disabled || !engine) {
      yield SCRIPTED_FALLBACK
      return
    }

    // Yield GPU headroom back to the renderer for the duration of
    // generation — inference and the scene's own draw calls are contending
    // for the same device. Read the prior scale first; a laptop already
    // throttled by `QualityMonitor` should be restored to *that* value, not
    // assumed to have been at 1.
    const priorDprScale = useQualityStore.getState().dprScale
    useQualityStore.getState().setDprScale(0.5)

    try {
      const stream = await engine.chat.completions.create({
        stream: true,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map((turn) => ({
            role: (turn.role === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: turn.text,
          })),
          { role: 'user', content: question },
        ],
      })

      let produced = false
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta.content
        if (delta) {
          produced = true
          yield delta
        }
      }

      // An empty stream is as much a failure as a thrown one — there is
      // nothing for the panel to have shown, so fall back the same way.
      if (!produced) {
        disabled = true
        yield SCRIPTED_FALLBACK
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[parrot] webllm generation failed, falling back to scripted', error)
      }
      disabled = true
      yield SCRIPTED_FALLBACK
    } finally {
      useQualityStore.getState().setDprScale(priorDprScale)
    }
  },
}

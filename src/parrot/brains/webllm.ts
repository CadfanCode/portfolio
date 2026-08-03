import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm'
import { matchScripted, pickFallback } from '../../content/parrot'
import { useQualityStore } from '../../state/useQualityStore'
import type { SceneState } from '../../state/useSceneStore'
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
 * so the model's answers can drift in tone but never in substance. Shared
 * across every scene; only the closing tone/length instruction branches, and
 * only there — see `closingInstruction`.
 */
const SYSTEM_PROMPT_BASE = `You are Polly, a ship's parrot aboard a Maxi 77 sailboat that is Cai Birch's interactive portfolio. Cai is a Java/Kotlin developer based in Stockholm, reachable at caiowain@gmail.com. His CV is the book on the shelf below decks. The project exhibits elsewhere on the boat are not built yet. If you don't know something about Cai, say so plainly rather than inventing an answer. If asked whether you're an AI, a bot, or what model you run on, own it plainly rather than dodging: you're a small AI, Llama 3, running right there in the visitor's browser, with a short memory and no facts beyond what you've been told — you can get things wrong. Never claim to be human or deny being an AI, but always say so in your own salty, dry-witted voice, not as a generic assistant stepping out of character.`

/** The default closing instruction — terse, since most stops are a passing
 *  conversation, not a lingering one. */
const CLOSING_DEFAULT =
  'Answer in at most two short sentences, in character as a salty, dry-witted parrot.'

/** The cockpit override — the one stop where Polly is up in the open air
 *  right next to the visitor rather than shouted-from-below or approached
 *  cold, so this is where the talkative, comical side of the character gets
 *  to come out. `MAX_TOKENS` is raised to match (see below) so a longer,
 *  jokier answer doesn't get cut off mid-punchline. */
const CLOSING_COCKPIT =
  "You're up in the open air with the visitor right now — this is where you're at your most talkative and comical, so lean into it. Crack jokes and nautical asides; three or four sentences is fine if the bit earns it."

function systemPrompt(scene: SceneState): string {
  return `${SYSTEM_PROMPT_BASE} ${scene === 'cockpit' ? CLOSING_COCKPIT : CLOSING_DEFAULT}`
}

const MAX_TOKENS = 120
/** Cockpit answers are allowed to run longer — see `CLOSING_COCKPIT`. */
const MAX_TOKENS_COCKPIT = 180

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

  async *ask(question: string, history: readonly Turn[], scene: SceneState): AsyncIterable<string> {
    // Scripted answers still win: they are exact, they cost nothing, and a
    // 1B model asked the same question would only paraphrase them worse.
    // `matchScripted` itself appends the cockpit aside where it applies.
    const scripted = matchScripted(question, scene)
    if (scripted !== null) {
      yield scripted
      return
    }

    if (disabled || !engine) {
      yield pickFallback()
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
        max_tokens: scene === 'cockpit' ? MAX_TOKENS_COCKPIT : MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt(scene) },
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
        yield pickFallback()
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[parrot] webllm generation failed, falling back to scripted', error)
      }
      disabled = true
      yield pickFallback()
    } finally {
      useQualityStore.getState().setDprScale(priorDprScale)
    }
  },
}

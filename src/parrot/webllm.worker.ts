import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

/**
 * The Web Worker entry for the parrot's opt-in Llama brain.
 *
 * This file is only ever reached via `new Worker(new URL('./webllm.worker.ts',
 * import.meta.url), { type: 'module' })` in `brains/webllm.ts`, itself only
 * called from the visitor's explicit opt-in — so unlike everything else in
 * `src/`, a *static* top-level import of `@mlc-ai/web-llm` here is fine: this
 * module only ever loads inside the worker thread it was spun up for, never
 * as part of the main bundle.
 *
 * `WebWorkerMLCEngineHandler` owns the actual `MLCEngine` and speaks the
 * message protocol that `CreateWebWorkerMLCEngine` on the main thread expects;
 * this file's only job is wiring the worker's `onmessage` to it.
 */
const handler = new WebWorkerMLCEngineHandler()

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg)
}

import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { useSceneStore } from '../state/useSceneStore'
import { useParrotStore } from './useParrotStore'
import { PARROT_NAME } from '../content/parrot'
import './ParrotChat.css'

/**
 * The click-to-open chat panel: a transcript, an input, and whichever brain
 * `brains/index.ts` currently hands out doing the answering (see that
 * module's own doc — this component never knows or cares which one).
 *
 * Mounted by `ParrotAssistant.tsx` inside a `<Html>` anchored beside Polly
 * rather than docked to a screen corner, and styled (`ParrotChat.css`) as a
 * speech balloon coming off him — a full-screen modal or a bottom-right
 * panel would read as a context switch away from the boat; this reads as a
 * conversation with the bird you can see.
 */
export function ParrotChat() {
  const chatOpen = useParrotStore((s) => s.chatOpen)
  const closeChat = useParrotStore((s) => s.closeChat)
  const history = useParrotStore((s) => s.history)
  const pending = useParrotStore((s) => s.pending)
  const draft = useParrotStore((s) => s.draft)
  const askParrot = useParrotStore((s) => s.askParrot)
  const inputOpen = useParrotStore((s) => s.inputOpen)
  const revealInput = useParrotStore((s) => s.revealInput)

  // Focus is not gating chat's own visibility — a visitor can still be
  // reading a close-up's own chrome while the panel is open — but Escape is:
  // `ExhibitOverlay.tsx`'s own doc explains that a *staged* exhibit binds no
  // Escape handler of its own so it doesn't fight `FocusExit`, which owns
  // Escape for the whole time a close-up is open. So this panel only claims
  // the key when there is no close-up for `FocusExit` to be backing out of.
  const focus = useSceneStore((s) => s.focus)

  const inputRef = useRef<HTMLInputElement>(null)
  const askButtonRef = useRef<HTMLButtonElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!chatOpen) return
    // Remember whatever had focus before the panel opened (almost always
    // nothing, since the parrot itself is a 3D object and can't hold DOM
    // focus) so closing can hand focus back somewhere sensible rather than
    // dropping it on `<body>`. Focus lands on whichever of the ask button or
    // the input is actually rendered — see the `inputOpen` effect below for
    // the case where that changes while the panel stays open.
    openerRef.current = document.activeElement as HTMLElement | null
    if (inputOpen) inputRef.current?.focus()
    else askButtonRef.current?.focus()

    return () => {
      openerRef.current?.focus?.()
    }
  }, [chatOpen, inputOpen])

  // Separate from the mount effect above: clicking "Ask something back"
  // doesn't remount the panel, so nothing else would move focus into the
  // freshly-revealed input.
  useEffect(() => {
    if (chatOpen && inputOpen) inputRef.current?.focus()
  }, [inputOpen, chatOpen])

  useEffect(() => {
    if (!chatOpen || focus !== null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [chatOpen, focus, closeChat])

  // Keep the transcript scrolled to the newest line as history and the
  // streaming draft grow, the same way any chat log does.
  useEffect(() => {
    const el = transcriptRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, draft])

  if (!chatOpen) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = inputRef.current
    if (!input || !input.value.trim() || pending) return
    const question = input.value
    input.value = ''
    void askParrot(question)
  }

  return (
    <div className="parrot-chat" role="dialog" aria-label={`Chat with ${PARROT_NAME}`}>
      <div className="parrot-chat-header">
        <span className="parrot-chat-title">{PARROT_NAME}</span>
        <button
          type="button"
          className="parrot-chat-close"
          onClick={closeChat}
          aria-label="Close chat"
          title="Close chat"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="parrot-chat-transcript" role="log" aria-live="polite" ref={transcriptRef}>
        {history.map((turn, i) => (
          <p key={i} className={`parrot-chat-turn parrot-chat-turn--${turn.role}`}>
            {turn.text}
          </p>
        ))}
        {pending && (
          <p className="parrot-chat-turn parrot-chat-turn--parrot parrot-chat-turn--pending">
            {draft || '…'}
          </p>
        )}
      </div>

      {inputOpen ? (
        <form className="parrot-chat-form" onSubmit={submit}>
          <label className="parrot-chat-label" htmlFor="parrot-chat-input">
            {`Ask ${PARROT_NAME} a question`}
          </label>
          <input
            id="parrot-chat-input"
            ref={inputRef}
            type="text"
            className="parrot-chat-input"
            placeholder="Ask something…"
            autoComplete="off"
            disabled={pending}
          />
          <button type="submit" className="parrot-chat-send" disabled={pending}>
            Send
          </button>
        </form>
      ) : (
        <div className="parrot-chat-form">
          <button
            ref={askButtonRef}
            type="button"
            className="parrot-chat-ask"
            onClick={revealInput}
          >
            Ask something back
          </button>
        </div>
      )}
    </div>
  )
}

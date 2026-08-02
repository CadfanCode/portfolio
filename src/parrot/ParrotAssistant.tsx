import { useEffect } from 'react'
import { Html } from '@react-three/drei'
import { useSceneStore } from '../state/useSceneStore'
import { PARROT_HINTS } from '../content/parrot'
import { HINT_VISIBLE_MS, ATTRACT_DELAY_MS, useParrotStore } from './useParrotStore'
import { Parrot } from './Parrot'
import { SpeechBubble, CHAT_ANCHOR } from './SpeechBubble'
import { ParrotChat } from './ParrotChat'

/** Beat between arriving at a stop and Skipper speaking up, so the line
 *  reads as a reaction to arrival rather than something that was already
 *  playing when you got there. */
const SPEAK_DELAY_MS = 1_200

/**
 * The 3D half of the guide character: the bird himself, always rendered; the
 * in-world hint bubble that carries his per-scene line at the cockpit stop;
 * and the click-to-open chat balloon, mounted here as a `<Html>` anchored
 * next to him rather than docked to a screen corner, so talking to Skipper
 * reads as talking to the bird you can see. Below decks both are suppressed
 * (see `ParrotChrome`, which speaks the hint for him there instead) — the
 * bird's body stays out of sight behind the coachroof once you're in the
 * cabin, and either box floating in the same spot with nothing visibly
 * saying it would read as a stray prop.
 */
export function ParrotAssistant() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const say = useParrotStore((s) => s.say)
  const hush = useParrotStore((s) => s.hush)
  const startAttract = useParrotStore((s) => s.startAttract)
  const leaveScene = useParrotStore((s) => s.leaveScene)
  const noteBooksOpened = useParrotStore((s) => s.noteBooksOpened)
  const bubble = useParrotStore((s) => s.bubble)
  const chatOpen = useParrotStore((s) => s.chatOpen)

  // Keyed only on `scene`, not on `isTransitioning` — `focusOn`/`clearFocus`
  // both flip `isTransitioning` too, so keying on it would re-arm the speak
  // and attract timers every time a close-up opens or closes at this stop,
  // including the books close-up itself, which would restart the very timer
  // its own opening is meant to cancel. Same reasoning `CabinHint.tsx` used
  // to document here before this replaced it.
  useEffect(() => {
    // At the ocean stop the visitor is orbiting the whole boat from outside;
    // nothing renders the bubble there (see the `line` guard below), so
    // scheduling a speak/hide pair would just be a timer that lies about
    // what's on screen.
    if (scene === 'ocean') {
      return () => leaveScene()
    }

    const speakTimer = window.setTimeout(() => say(PARROT_HINTS[scene]), SPEAK_DELAY_MS)
    const hideTimer = window.setTimeout(hush, SPEAK_DELAY_MS + HINT_VISIBLE_MS)
    const attractTimer =
      scene === 'cabin' ? window.setTimeout(startAttract, ATTRACT_DELAY_MS) : undefined

    return () => {
      window.clearTimeout(speakTimer)
      window.clearTimeout(hideTimer)
      if (attractTimer !== undefined) window.clearTimeout(attractTimer)
      leaveScene()
    }
  }, [scene, say, hush, startAttract, leaveScene])

  useEffect(() => {
    if (scene === 'cabin' && focus === 'books') noteBooksOpened()
  }, [scene, focus, noteBooksOpened])

  // The in-world bubble only ever shows at the cockpit stop: below decks
  // `ParrotChrome`'s DOM box speaks for him instead, over a close-up it
  // would be clutter (same as `CabinHint.tsx`'s old `focus` check), and at
  // the ocean stop the visitor is orbiting the whole boat from outside — the
  // bird isn't even the thing being looked at, so a prompt anchored to him
  // would read as attached to nothing.
  const line = scene === 'cockpit' && focus === null ? bubble : null

  // The balloon is below decks' equivalent of the coachroof problem the
  // hint bubble already has: the bird himself is out of sight in the cabin,
  // so a balloon pointing at nothing would read as a stray prop (same
  // reasoning as the `line` guard above, and the doc at the top of this
  // file). `chatOpen` alone gates it everywhere else — unlike the passive
  // hint, the chat is something the visitor asked for, so it stays up over
  // a close-up rather than being suppressed by `focus`.
  const showChat = chatOpen && scene !== 'cabin'

  return (
    <>
      <Parrot />
      <SpeechBubble line={line} />
      {showChat && (
        // `zIndexRange` capped at 4, same as `.resume-chrome`'s own z-index
        // (`ResumeChrome.css:7`): under `.focus-exit`'s 5, so a close-up's
        // back button still wins if the two are ever on screen together.
        <Html position={CHAT_ANCHOR} pointerEvents="auto" occlude={false} zIndexRange={[4, 0]}>
          <ParrotChat />
        </Html>
      )}
    </>
  )
}

import { useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../state/useSceneStore'
import { ATTRACT_DELAY_MS, useParrotStore } from './useParrotStore'
import { Parrot } from './Parrot'
import { CHAT_ANCHOR } from './geometry'
import { ParrotChat } from './ParrotChat'
import { sampleConditions } from '../scene/conditions'
import { PARROT_WEATHER_HINTS } from '../content/parrot'

/** How long a visitor can sit in the cabin, books unopened and chat unopened,
 *  before Polly squawks the nudge himself — see the cabin effect below. Kept
 *  as its own constant rather than reusing `ATTRACT_DELAY_MS`, even though
 *  the squawk now also starts the spine blink (see that effect): the two
 *  still mean different things — one is "how long before Polly says
 *  something", the other is "how long before the shelf lights up on its
 *  own even with no line said" (the fallback path below) — they just
 *  happen to fire together on the common path now. */
const CABIN_NUDGE_DELAY_MS = 20_000

/**
 * The 3D half of the guide character: the bird himself, always rendered, and
 * the click-to-open chat balloon, mounted here as a `<Html>` anchored next to
 * him rather than docked to a screen corner, so talking to Polly reads as
 * talking to the bird you can see. Below decks the bird's body is out of
 * sight behind the coachroof, so the balloon is docked to the screen instead
 * (see `ParrotChatDock.tsx`) and this component only fires the cabin's own
 * delayed nudge into the same chat state.
 */
export function ParrotAssistant() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const startAttract = useParrotStore((s) => s.startAttract)
  const leaveScene = useParrotStore((s) => s.leaveScene)
  const noteBooksOpened = useParrotStore((s) => s.noteBooksOpened)
  const chatOpen = useParrotStore((s) => s.chatOpen)
  const booksSeen = useParrotStore((s) => s.booksSeen)
  const openChat = useParrotStore((s) => s.openChat)
  const announceWeather = useParrotStore((s) => s.announceWeather)

  // Keyed only on `scene`, not on `isTransitioning` — `focusOn`/`clearFocus`
  // both flip `isTransitioning` too, so keying on it would re-arm the attract
  // timer every time a close-up opens or closes at this stop, including the
  // books close-up itself, which would restart the very timer its own
  // opening is meant to cancel.
  useEffect(() => {
    const attractTimer =
      scene === 'cabin' ? window.setTimeout(startAttract, ATTRACT_DELAY_MS) : undefined

    return () => {
      if (attractTimer !== undefined) window.clearTimeout(attractTimer)
      leaveScene()
    }
  }, [scene, startAttract, leaveScene])

  useEffect(() => {
    if (scene === 'cabin' && focus === 'books') noteBooksOpened()
  }, [scene, focus, noteBooksOpened])

  // The cabin's own delayed squawk: the bird is unreachable there (behind
  // the coachroof, out of click range), so instead of waiting to be clicked
  // he speaks up on his own once someone's lingered without finding the
  // shelf. Same dependency discipline as the attract effect above and for
  // the same reason — `focus`/`isTransitioning` would re-arm this on every
  // close-up. Also starts the spine blink here, not just at the standalone
  // effect's own 60s: the line says "check out the books", so the shelf
  // should light up the moment he says it, not 40s afterward. `startAttract`
  // is a no-op once the books are already seen, so calling it a second time
  // when the standalone effect's own timer lands later is harmless.
  useEffect(() => {
    if (scene !== 'cabin') return
    const nudgeTimer = window.setTimeout(() => {
      if (!booksSeen && !chatOpen) {
        openChat('cabin')
        startAttract()
      }
    }, CABIN_NUDGE_DELAY_MS)
    return () => window.clearTimeout(nudgeTimer)
  }, [scene, booksSeen, chatOpen, openChat, startAttract])

  // Watches the drifting weather (`conditions.ts`) for a crossing into a
  // named preset worth an unprompted line. `prevWeatherName` starts `null`
  // so the very first sample just records where the drift already is,
  // rather than treating scene load as a "crossing" into whatever preset
  // happens to be current.
  const prevWeatherName = useRef<string | null>(null)
  useFrame((state) => {
    const name = sampleConditions(state.clock.elapsedTime).name
    if (prevWeatherName.current === null) {
      prevWeatherName.current = name
      return
    }
    if (name === prevWeatherName.current) return
    prevWeatherName.current = name

    const line = PARROT_WEATHER_HINTS[name]
    if (!line) return
    // Same "don't interrupt" guards as the click-to-open balloon: no cabin
    // (no balloon to speak from there), no close-up, no camera move, and no
    // stepping on an already-open conversation.
    if (scene === 'cabin' || focus !== null || isTransitioning || chatOpen) return
    announceWeather(line)
  })

  // The balloon is anchored to the bird himself, so it only makes sense
  // where he's actually visible — below decks he's out of sight behind the
  // coachroof, and `ParrotChatDock.tsx` speaks for him there instead.
  const showChat = chatOpen && scene !== 'cabin'

  return (
    <>
      <Parrot />
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

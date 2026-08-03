import { useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../state/useSceneStore'
import {
  useParrotStore,
  ATTRACT_OSCILLATION_MS,
  ATTRACT_OSCILLATIONS_PER_BURST,
} from './useParrotStore'
import { Parrot } from './Parrot'
import { CHAT_ANCHOR } from './geometry'
import { ParrotChat } from './ParrotChat'
import { sampleConditions } from '../scene/conditions'
import { PARROT_WEATHER_HINTS } from '../content/parrot'

/** How long a visitor can sit in the cabin, books unopened, before the shelf
 *  starts pulsing to draw the eye — see the cabin effect below. */
const ATTRACT_FIRST_DELAY_MS = 20_000

/** Gap between the end of one attract burst and the start of the next. */
const ATTRACT_BURST_GAP_MS = 5_000

/** How long a single burst stays "on" — `ATTRACT_OSCILLATIONS_PER_BURST`
 *  pulses back to back, at `ATTRACT_OSCILLATION_MS` each. `BookSpines.tsx`
 *  is what actually draws the oscillation within this window; this effect
 *  only owns when the window opens and closes. */
const ATTRACT_BURST_DURATION_MS = ATTRACT_OSCILLATIONS_PER_BURST * ATTRACT_OSCILLATION_MS

/**
 * The 3D half of the guide character: the bird himself, always rendered, and
 * the click-to-open chat balloon, mounted here as a `<Html>` anchored next to
 * him rather than docked to a screen corner, so talking to Polly reads as
 * talking to the bird you can see. Below decks the bird's body is out of
 * sight behind the coachroof, so the balloon is docked to the screen instead
 * (see `ParrotChatDock.tsx`) and this component's cabin-specific job is just
 * the book-blink nudge below, not a spoken line.
 */
export function ParrotAssistant() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const isTransitioning = useSceneStore((s) => s.isTransitioning)
  const startAttract = useParrotStore((s) => s.startAttract)
  const stopAttract = useParrotStore((s) => s.stopAttract)
  const leaveScene = useParrotStore((s) => s.leaveScene)
  const noteBooksOpened = useParrotStore((s) => s.noteBooksOpened)
  const chatOpen = useParrotStore((s) => s.chatOpen)
  const booksSeen = useParrotStore((s) => s.booksSeen)
  const announceWeather = useParrotStore((s) => s.announceWeather)

  // Cleared on every scene change, not just a cabin one — `leaveScene` also
  // resets `chatOpen`, which matters leaving any stop, not only the cabin.
  useEffect(() => {
    return () => leaveScene()
  }, [scene, leaveScene])

  useEffect(() => {
    if (scene === 'cabin' && focus === 'books') noteBooksOpened()
  }, [scene, focus, noteBooksOpened])

  // The book-blink nudge: no spoken line any more (the bird is unreachable
  // in the cabin anyway, behind the coachroof), just the shelf itself
  // pulsing gold in bursts once someone's lingered without finding it.
  // Bursts repeat indefinitely rather than a fixed total — what stops the
  // nudge is `booksSeen`, not a countdown, so this effect's own cleanup is
  // what cancels the pending chain, firing the instant a click sets
  // `booksSeen` true (it's a dependency below) rather than leaning on
  // `startAttract`'s own guard as the only backstop. Not keyed on
  // `isTransitioning`: `focusOn`/`clearFocus` flip it too, and the books
  // close-up itself is one of those transitions, so keying on it would
  // re-arm the whole chain every time that close-up opens or closes.
  useEffect(() => {
    if (scene !== 'cabin' || booksSeen) return

    let cancelled = false
    let timer: number

    const scheduleBurst = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return
        startAttract()
        timer = window.setTimeout(() => {
          if (cancelled) return
          stopAttract()
          scheduleBurst(ATTRACT_BURST_GAP_MS)
        }, ATTRACT_BURST_DURATION_MS)
      }, delay)
    }

    scheduleBurst(ATTRACT_FIRST_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [scene, booksSeen, startAttract, stopAttract])

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

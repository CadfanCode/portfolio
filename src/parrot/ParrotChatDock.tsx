import { useSceneStore } from '../state/useSceneStore'
import { useParrotStore } from './useParrotStore'
import { ParrotChat } from './ParrotChat'
import './ParrotChat.css'

/**
 * The cabin's mount for the chat panel. The bird is genuinely unreachable
 * below decks — the cabin eye is at `[0, 1.05, 1.05]` looking to −z, and the
 * perch is at `[-0.62, 0.964, 1.338]`, behind the camera and the bulkhead —
 * so a `<Html>` anchored to him there would project to garbage. This mounts
 * the same `<ParrotChat />` outside the Canvas instead, docked to a fixed
 * screen position (see `.parrot-chat-dock` in `ParrotChat.css`), in the same
 * bottom-centre slot the old `ParrotChrome` occupied.
 */
export function ParrotChatDock() {
  const scene = useSceneStore((s) => s.scene)
  const focus = useSceneStore((s) => s.focus)
  const chatOpen = useParrotStore((s) => s.chatOpen)

  // Same guard the old `ParrotChrome.tsx` used: nothing floats over a
  // close-up, and this is the cabin's own voice, so it only shows there.
  if (!(chatOpen && scene === 'cabin' && focus === null)) return null

  return (
    <div className="parrot-chat-dock">
      <ParrotChat />
    </div>
  )
}

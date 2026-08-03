import { useEffect } from 'react'
import { useComingSoonStore } from './state/useComingSoonStore'
import './ComingSoonToast.css'

/** How long the toast stays up before it dismisses itself. */
const DISMISS_MS = 2200

/**
 * A brief top-centre toast for the placeholder exhibits — the chart table,
 * the VHF, and any book with neither `exhibit` nor `url` — so clicking one
 * reads as "not built yet" rather than as a dead click. Top-centre rather
 * than either of the two corners already in use: `.focus-exit` owns top-left
 * whenever a close-up is open (which it always is when this fires — see
 * `FocusTargets.tsx`/`BookSpines.tsx`), and `.parrot-chat-dock` owns
 * bottom-centre, cabin-only.
 */
export function ComingSoonToast() {
  const message = useComingSoonStore((s) => s.message)
  const clear = useComingSoonStore((s) => s.clear)

  useEffect(() => {
    if (message === null) return
    const timer = window.setTimeout(clear, DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [message, clear])

  if (message === null) return null

  return (
    <div className="coming-soon-toast" role="status">
      {message}
    </div>
  )
}

import { useAudioStore } from './state/useAudioStore'
import './SoundToggle.css'

/**
 * Mute. DOM rather than a 3D object, for the reason the exhibit panels are:
 * it is a control, not part of the world, and it has to be reachable by a
 * keyboard and named to a screen reader.
 *
 * Three states, not two. On, off, and "on but the browser has not let go yet"
 * — that last one lasts from load until the visitor's first click, and without
 * showing it the button spends those seconds claiming sound is playing when the
 * page is silent, which reads as broken audio rather than as a browser policy.
 */
export function SoundToggle() {
  const enabled = useAudioStore((s) => s.enabled)
  const blocked = useAudioStore((s) => s.blocked)
  const toggle = useAudioStore((s) => s.toggle)

  const waiting = enabled && blocked
  const label = waiting
    ? 'Sound on — click anywhere to start it'
    : enabled
      ? 'Mute the sea'
      : 'Unmute the sea'

  return (
    <button
      type="button"
      className="sound-toggle"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      data-waiting={waiting || undefined}
    >
      {/* One speaker, with the waves drawn only when there is something to
          hear. A crossed-out speaker and a plain one are two icons the eye has
          to compare; a speaker that grows waves is one icon that changes. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" />
        {enabled && <path className="wave near" d="M15.2 9.6a3.4 3.4 0 0 1 0 4.8" />}
        {enabled && <path className="wave far" d="M17.9 7.1a7 7 0 0 1 0 9.8" />}
        {!enabled && <path className="mute" d="M15.5 9.8l4.6 4.6M20.1 9.8l-4.6 4.6" />}
      </svg>
    </button>
  )
}

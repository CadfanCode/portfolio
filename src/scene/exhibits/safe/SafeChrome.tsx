import { useEffect } from 'react'
import { SAFE_CARDS, SAFE_COPY, SAFE_ITEMS } from '../../../content/safe'
import { useSceneStore } from '../../../state/useSceneStore'
import type { TokenClaims } from './safeAuthClient'
import type { SafePhase, SafeResult } from './useSafe'
import { PASSCODE_LENGTH, useSafe } from './useSafe'
import './SafeChrome.css'

/** The order claims are shown in, independent of key order in the decoded
 *  JSON — both token shapes are read through this same list, and a claim
 *  the token does not carry (`scope` on the ID token, `auth_time` on the
 *  access token) is simply skipped rather than shown blank. */
const CLAIM_ORDER: (keyof TokenClaims)[] = [
  'iss',
  'sub',
  'aud',
  'scope',
  'iat',
  'exp',
  'auth_time',
  'card_id',
]

/** A plain-English line for each claim, because the point of this panel is
 *  that a visitor can read a real JWT and understand it, not just see that
 *  one came back. */
const CLAIM_GLOSS: Partial<Record<keyof TokenClaims, string>> = {
  iss: 'Which server minted this token.',
  sub: 'Who the token is about — here the certificate’s serial number in hex, so identity is bound to the credential that was issued rather than to a guessable name.',
  aud: 'Who the token is for. Checking this stops a token minted for one API being replayed against another.',
  scope:
    'What the bearer may do. One space-delimited string rather than a JSON array, because that is how RFC 6749 defines it — a client written to the spec will fail to parse an array.',
  iat: 'When the token was issued.',
  exp: 'When it stops working. Five minutes after issue, on purpose, so a leaked token is only useful briefly.',
  auth_time: 'When the passcode was actually verified.',
  card_id: 'Which card was tapped. Not a standard OIDC claim — this one is the demo’s own.',
}

const EPOCH_CLAIMS = new Set<keyof TokenClaims>(['iat', 'exp', 'auth_time'])

/** Renders a claim's raw value alongside a readable timestamp for the three
 *  epoch-seconds fields, so a visitor does not have to do the arithmetic
 *  themselves to see that `exp` really is five minutes past `iat`. */
function formatClaimValue(key: keyof TokenClaims, value: TokenClaims[keyof TokenClaims]): string {
  if (value === undefined) return ''
  if (EPOCH_CLAIMS.has(key) && typeof value === 'number') {
    return `${value} (${new Date(value * 1000).toLocaleString()})`
  }
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function ClaimTable({ claims }: { claims: TokenClaims }) {
  const rows = CLAIM_ORDER.filter((key) => claims[key] !== undefined)
  return (
    <div className="safe-claims-wrap">
      <table className="safe-claims">
        <thead>
          <tr>
            <th scope="col">Claim</th>
            <th scope="col">Value</th>
            <th scope="col">What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => (
            <tr key={key}>
              <td>
                <code>{key}</code>
              </td>
              <td className="safe-claims-value">{formatClaimValue(key, claims[key])}</td>
              <td>{CLAIM_GLOSS[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The compact JWT with its three dot-separated parts in their own spans, so
 *  a visitor can see header / payload / signature as distinct pieces rather
 *  than one undifferentiated blob of base64 — which is also, not
 *  coincidentally, the reason a JWT is easy to inspect in the first place. */
function JwtDisplay({ token }: { token: string }) {
  const [header, payload, signature] = token.split('.')
  return (
    <code className="safe-jwt-block">
      <span className="safe-jwt-header">{header}</span>
      <span className="safe-jwt-dot">.</span>
      <span className="safe-jwt-payload">{payload}</span>
      <span className="safe-jwt-dot">.</span>
      <span className="safe-jwt-signature">{signature ?? ''}</span>
    </code>
  )
}

type SafeKeypadProps = {
  pin: string
  onDigit: (digit: string) => void
  onBackspace: () => void
  onSubmit: () => void
}

/** 1-9 in a phone dial-pad grid, then backspace / 0 / enter — the one
 *  numeric layout almost every visitor already has in their fingers. */
const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function SafeKeypad({ pin, onDigit, onBackspace, onSubmit }: SafeKeypadProps) {
  const filled = pin.length

  return (
    <div className="safe-keypad">
      {/* The passcode is printed on the card that unlocks it (see
          `content/safe.ts`), so masking these slots would be security
          theatre over a passcode that is not actually secret. Showing the
          digits as typed lets a visitor immediately check they copied the
          card correctly, which is the actual point of this demo. The
          `aria-label` on the wrapper carries the same information for a
          screen reader rather than leaning on four visually-updating spans. */}
      <div
        className="safe-pin-slots"
        role="status"
        aria-live="polite"
        aria-label={pin.length > 0 ? `Entered ${pin.split('').join(' ')}` : 'No digits entered'}
      >
        {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
          <span key={i} className="safe-pin-slot" data-filled={i < filled}>
            {pin[i] ?? ''}
          </span>
        ))}
      </div>
      <div className="safe-keypad-grid">
        {KEYPAD_DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className="safe-key"
            onClick={() => onDigit(digit)}
            disabled={filled >= PASSCODE_LENGTH}
            aria-label={`Digit ${digit}`}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="safe-key safe-key-backspace"
          onClick={onBackspace}
          disabled={filled === 0}
          aria-label="Delete last digit"
        >
          ⌫
        </button>
        <button
          type="button"
          className="safe-key"
          onClick={() => onDigit('0')}
          disabled={filled >= PASSCODE_LENGTH}
          aria-label="Digit 0"
        >
          0
        </button>
        <button
          type="button"
          className="safe-key safe-key-enter safe-button-primary"
          onClick={onSubmit}
          disabled={filled !== PASSCODE_LENGTH}
        >
          Enter
        </button>
      </div>
    </div>
  )
}

function SafeOpenPanel({ result, onReset }: { result: SafeResult; onReset: () => void }) {
  return (
    <div className="safe-open">
      <h3>What was inside</h3>
      <ul className="safe-items">
        {result.items.map((item) => {
          const known = SAFE_ITEMS[item]
          return (
            <li key={item}>
              <strong>{known?.label ?? item}</strong>
              {known && <span className="safe-item-note"> — {known.note}</span>}
            </li>
          )
        })}
      </ul>

      {/* Never a footnote: whether this came from the live backend or a
          recorded transcript is exactly the fact a visitor must not be
          misled about, so it gets its own bordered line right under the
          items rather than a small-print aside. The distinction is carried
          in the words themselves, not colour alone. */}
      <p className="safe-badge" data-live={result.live}>
        {result.live ? SAFE_COPY.liveNotice : SAFE_COPY.recordedNotice}
      </p>

      <h3>Access token — what may be done</h3>
      {result.accessClaims ? (
        <ClaimTable claims={result.accessClaims} />
      ) : (
        <p>Could not decode the access token.</p>
      )}
      <JwtDisplay token={result.accessToken} />

      <details className="safe-id-details">
        <summary>ID token — who presented the card</summary>
        <p className="safe-id-note">
          The access token above says what may be done; this one only says who presented the
          card. Unlike the access token, it carries no <code>scope</code> at all.
        </p>
        {result.idClaims ? (
          <ClaimTable claims={result.idClaims} />
        ) : (
          <p>Could not decode the ID token.</p>
        )}
        <JwtDisplay token={result.idToken} />
      </details>

      <p className="safe-jwt-note">
        A JWT is signed, not encrypted — the claims above are exactly what anyone holding this
        token can read, whether or not they are allowed to use it.
      </p>

      {!result.live && (
        <p className="safe-recorded-note">
          The <code>exp</code> above is already in the past: this recording is older than the
          access token&rsquo;s five-minute lifetime. That is a bearer token correctly expiring,
          not a fault in this demo.
        </p>
      )}

      <p className="safe-repo-note">{SAFE_COPY.repoNote}</p>

      <button type="button" className="safe-button safe-button-primary" onClick={onReset}>
        Try the other card
      </button>
    </div>
  )
}

/** The short line above the keypad or result, always present so a screen
 *  reader hears the tap succeed or fail without having to explore the whole
 *  panel — the actual `aria-live` region lives on `.safe-status` below. */
function phaseStatus(phase: SafePhase): string {
  switch (phase) {
    case 'idle':
      return SAFE_COPY.pickPrompt
    case 'holding':
      return SAFE_COPY.tapPrompt
    case 'tapping':
      return 'Tapping the card against the reader…'
    case 'pin':
      return SAFE_COPY.pinPrompt
    case 'verifying':
      return SAFE_COPY.verifying
    case 'open':
      return 'Granted. The safe is open.'
    case 'denied':
      return SAFE_COPY.denied
  }
}

/**
 * The safe exhibit's DOM half: the keypad and, once the door has swung, the
 * decoded tokens — which is the actual point of this exhibit, the safe
 * itself is set dressing for it.
 *
 * A docked side panel rather than a full-bleed overlay like
 * `AboutChrome`/`ResumeChrome`: those chromes exist to add a couple of
 * controls on top of a stage that fills the frame, but this one's payload
 * is a paragraph of claims and a keypad, so it needs real, scrollable
 * width, and docking it to one side keeps the safe and its cards visible
 * in the 3D behind it instead of hiding the thing being explained.
 *
 * Checks `activeExhibitId === 'safe'` itself rather than trusting
 * `ExhibitOverlay` to gate it, same as `AboutChrome` — a staged exhibit's
 * `Content` is rendered unconditionally once mounted, so each one is
 * responsible for its own visibility. Escape is not bound here: `FocusExit`
 * already closes the active exhibit on Escape whenever a focus is framed,
 * and this chrome has no second, nested modal state (like `AboutChrome`'s
 * expanded video player) that would need to intercept it first.
 */
export function SafeChrome() {
  const activeExhibitId = useSceneStore((s) => s.activeExhibitId)
  const isOpen = activeExhibitId === 'safe'

  const phase = useSafe((s) => s.phase)
  const cardId = useSafe((s) => s.cardId)
  const pin = useSafe((s) => s.pin)
  const result = useSafe((s) => s.result)
  const refusal = useSafe((s) => s.refusal)
  const pickUp = useSafe((s) => s.pickUp)
  const putDown = useSafe((s) => s.putDown)
  const beginTap = useSafe((s) => s.beginTap)
  const pressKey = useSafe((s) => s.pressKey)
  const backspace = useSafe((s) => s.backspace)
  const submit = useSafe((s) => s.submit)
  const reset = useSafe((s) => s.reset)

  // A physical keyboard has to work as well as the on-screen keypad: digits
  // type, Backspace deletes, Enter submits once the passcode is full. Scoped
  // to the `pin` phase so typing elsewhere in the app (or in other phases of
  // this exhibit) is never swallowed by a listener that has nothing to do.
  useEffect(() => {
    if (!isOpen || phase !== 'pin') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        pressKey(event.key)
      } else if (event.key === 'Backspace') {
        backspace()
      } else if (event.key === 'Enter' && pin.length === PASSCODE_LENGTH) {
        void submit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, phase, pin, pressKey, backspace, submit])

  if (!isOpen) return null

  const card = cardId ? SAFE_CARDS.find((c) => c.id === cardId) : undefined

  return (
    <div className="safe-chrome">
      <div className="safe-panel">
        <h2>{SAFE_COPY.title}</h2>
        <p className="safe-standfirst">{SAFE_COPY.standfirst}</p>
        <p className="safe-status" role="status" aria-live="polite">
          {phaseStatus(phase)}
        </p>

        {phase === 'idle' && (
          <div className="safe-cards">
            {SAFE_CARDS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="safe-card-button"
                style={{ borderColor: c.colour, color: c.colour }}
                onClick={() => pickUp(c.id)}
              >
                <span className="safe-card-name">{c.displayName}</span>
                <span className="safe-card-passcode">{c.passcode}</span>
              </button>
            ))}
          </div>
        )}

        {phase === 'holding' && card && (
          <div className="safe-holding">
            <p className="safe-holding-card" style={{ color: card.colour }}>
              {card.displayName}
            </p>
            <div className="safe-actions">
              <button type="button" className="safe-button safe-button-primary" onClick={beginTap}>
                Tap card
              </button>
              <button type="button" className="safe-button" onClick={putDown}>
                Put card back
              </button>
            </div>
          </div>
        )}

        {phase === 'pin' && (
          <SafeKeypad
            pin={pin}
            onDigit={pressKey}
            onBackspace={backspace}
            onSubmit={() => void submit()}
          />
        )}

        {phase === 'denied' && (
          <div className="safe-denied">
            {refusal && <p className="safe-refusal">{refusal}</p>}
            <button type="button" className="safe-button safe-button-primary" onClick={reset}>
              Try again
            </button>
          </div>
        )}

        {phase === 'open' && result && <SafeOpenPanel result={result} onReset={reset} />}
      </div>
    </div>
  )
}

/**
 * Copy and fixed data for the safe exhibit.
 *
 * The cards' display names come from the backend when it is reachable
 * (`GET /api/cards`), so what is here is the fallback for when it is not, plus
 * everything the backend has no opinion about: the passcodes printed on the
 * cards, what each item in the safe actually is, and the prose that explains
 * what the visitor just watched happen.
 *
 * The passcodes are here rather than in the client because they are printed on
 * the cards in the scene. They are not a secret in any sense — the backend
 * stores them as salted PBKDF2 hashes and has never seen these strings — they
 * are the demo's equivalent of a sticky note on a monitor, which is exactly
 * what a passcode written on the card it unlocks is.
 */

export type SafeCard = {
  id: string
  displayName: string
  /** Printed on the card face in the scene, and pre-filled nowhere. */
  passcode: string
  /** Hex for the card's plastic. Matches `card_blue` / `card_red` in Blender. */
  colour: string
  /** What this card is entitled to, for the fallback path only. The live path
   *  never consults this — scopes come out of the signed certificate. */
  entitlements: string[]
}

export const SAFE_CARDS: SafeCard[] = [
  {
    id: 'card-blue',
    displayName: 'Blue Crew Card',
    passcode: '1977',
    colour: '#2f5d8a',
    entitlements: ['safe:boat'],
  },
  {
    id: 'card-red',
    displayName: 'Red Skipper Card',
    passcode: '7731',
    colour: '#8a3330',
    entitlements: ['safe:boat', 'safe:key'],
  },
]

/** What the backend's scope strings mean as objects in the safe. The backend
 *  returns bare item names — "boat", "key" — and this is the only place that
 *  turns one into something a visitor reads. */
export const SAFE_ITEMS: Record<string, { label: string; note: string }> = {
  boat: {
    label: 'A half-hull model',
    note: 'Granted by safe:boat, which both cards carry.',
  },
  key: {
    label: 'A brass key',
    note: 'Granted by safe:key, which only the red card carries.',
  },
}

export const SAFE_COPY = {
  title: 'The safe',
  standfirst:
    'A certificate is the card, a passcode unlocks it, and the scopes in an access token decide what is inside.',
  pickPrompt: 'Take a card from the chart',
  tapPrompt: 'Tap it against the slot',
  pinPrompt: 'Enter the four-digit passcode',
  verifying: 'Verifying the certificate against the root CA…',
  denied: 'Refused. The safe stays shut.',
  /** Shown on the brass plate when the backend could not be reached. Honest
   *  rather than silent: the exhibit still works, and says why. */
  recordedNotice:
    'Demo backend not running — showing a recorded tap. The flow is real; the tokens below were captured from a live run.',
  liveNotice: 'Live — these tokens were issued just now by the safe-auth backend.',
  repoNote:
    'The backend is a standalone Java service: an in-memory EC P-256 root CA, a custom X.509 extension carrying the entitlements, and hand-written JWT validation.',
} as const

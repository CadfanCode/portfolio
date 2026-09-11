import { create } from 'zustand'
import { SAFE_CARDS } from '../../../content/safe'
import { RECORDED_FLOWS } from './recordedFlow'
import {
  SafeAuthRefused,
  decodeClaims,
  fetchCertificate,
  openSafe,
  tap,
  type TokenClaims,
} from './safeAuthClient'

/**
 * The safe exhibit's state machine.
 *
 * Split out of the components because two of them need it and neither owns it:
 * `Safe.tsx` animates the pose each phase implies, and `SafeChrome.tsx` renders
 * the keypad and the result. Keeping the phase here means the door swings
 * because the flow says it opened, rather than the flow completing because an
 * animation finished.
 *
 * The phases are the tap, in order:
 *
 *   idle       nothing in hand
 *   holding    a card picked up off the chart
 *   tapping    the card is on its way to the slot — `Safe.tsx` reports back
 *   pin        card in the slot, keypad up
 *   verifying  the request is in flight
 *   open       granted; the door swings and the contents light
 *   denied     refused; the door stays shut and the card comes back out
 *
 * `denied` is a resting state, not an error state. A refused tap is the system
 * working, and the one thing this exhibit exists to show.
 */

export type SafePhase = 'idle' | 'holding' | 'tapping' | 'pin' | 'verifying' | 'open' | 'denied'

export const PASSCODE_LENGTH = 4

export type SafeResult = {
  /** True when a real backend answered. False when this came from the
   *  recording — the chrome says which, rather than letting a visitor assume. */
  live: boolean
  items: string[]
  accessToken: string
  idToken: string
  accessClaims: TokenClaims | null
  idClaims: TokenClaims | null
}

type SafeStore = {
  phase: SafePhase
  cardId: string | null
  pin: string
  result: SafeResult | null
  /** Why the tap was refused, in the backend's own words where it gave any. */
  refusal: string | null
  /** null until the warm-up ping has answered. Only used to set expectations
   *  in the chrome before anyone taps — the tap itself always tries live. */
  backendLive: boolean | null

  setBackendLive: (live: boolean) => void
  pickUp: (cardId: string) => void
  putDown: () => void
  /** Begin the move to the slot. `Safe.tsx` calls `tapLanded` when it arrives. */
  beginTap: () => void
  tapLanded: () => void
  pressKey: (digit: string) => void
  backspace: () => void
  /** Runs the whole flow. Resolves once the safe is open or the tap refused. */
  submit: () => Promise<void>
  reset: () => void
}

export const useSafe = create<SafeStore>((set, get) => ({
  phase: 'idle',
  cardId: null,
  pin: '',
  result: null,
  refusal: null,
  backendLive: null,

  setBackendLive: (live) => set({ backendLive: live }),

  pickUp: (cardId) => {
    // Only from rest. Picking a second card mid-flow would leave the first one
    // animating toward a slot it is no longer going into.
    if (get().phase !== 'idle') return
    set({ phase: 'holding', cardId, pin: '', result: null, refusal: null })
  },

  putDown: () => {
    if (get().phase !== 'holding') return
    set({ phase: 'idle', cardId: null })
  },

  beginTap: () => {
    if (get().phase !== 'holding') return
    set({ phase: 'tapping' })
  },

  tapLanded: () => {
    if (get().phase !== 'tapping') return
    set({ phase: 'pin' })
  },

  pressKey: (digit) => {
    const { phase, pin } = get()
    if (phase !== 'pin' || pin.length >= PASSCODE_LENGTH) return
    set({ pin: pin + digit })
  },

  backspace: () => {
    const { phase, pin } = get()
    if (phase !== 'pin' || pin.length === 0) return
    set({ pin: pin.slice(0, -1) })
  },

  submit: async () => {
    const { phase, pin, cardId } = get()
    if (phase !== 'pin' || !cardId || pin.length !== PASSCODE_LENGTH) return
    set({ phase: 'verifying', refusal: null })

    try {
      // The live path, in full: fetch the certificate now rather than from a
      // cache (the CA is regenerated on every backend restart), present it with
      // the passcode, then spend the access token on the safe itself.
      const pem = await fetchCertificate(cardId)
      const tokens = await tap(pem, pin)
      const items = await openSafe(tokens.accessToken)

      set({
        phase: 'open',
        result: {
          live: true,
          items,
          accessToken: tokens.accessToken,
          idToken: tokens.idToken,
          accessClaims: decodeClaims(tokens.accessToken),
          idClaims: decodeClaims(tokens.idToken),
        },
      })
    } catch (error) {
      // A refusal is an answer. The backend verified the certificate and
      // checked the passcode and said no, and that is the truth to show.
      if (error instanceof SafeAuthRefused) {
        set({ phase: 'denied', refusal: error.message, backendLive: true })
        return
      }
      // Anything else means we never got an answer — nothing listening, or a
      // container still waking. Fall back to the recording, and check the
      // passcode here because in this path there is no server to check it.
      set({ backendLive: false })
      grantFromRecording(set, cardId, pin)
    }
  },

  reset: () =>
    set({ phase: 'idle', cardId: null, pin: '', result: null, refusal: null }),
}))

/**
 * The recorded path.
 *
 * Checking the passcode in the browser is exactly what the live path does not
 * do, and it is worth being plain about why it is acceptable here: there is
 * nothing to protect. The safe holds a model boat and a key, the passcodes are
 * printed on the cards in the scene, and the whole exchange is a demonstration.
 * Where it would matter — where a wrong answer must cost something — the check
 * is `PasscodeVault.verify` on the server, and this branch only runs when that
 * server could not be reached at all.
 */
function grantFromRecording(
  set: (partial: Partial<SafeStore>) => void,
  cardId: string,
  pin: string,
) {
  const card = SAFE_CARDS.find((c) => c.id === cardId)
  const recorded = RECORDED_FLOWS[cardId]

  if (!card || !recorded) {
    set({ phase: 'denied', refusal: 'No recording for this card.' })
    return
  }

  if (pin !== card.passcode) {
    set({ phase: 'denied', refusal: 'Card and passcode were not accepted' })
    return
  }

  set({
    phase: 'open',
    result: {
      live: false,
      items: recorded.items,
      accessToken: recorded.accessToken,
      idToken: recorded.idToken,
      accessClaims: decodeClaims(recorded.accessToken),
      idClaims: decodeClaims(recorded.idToken),
    },
  })
}

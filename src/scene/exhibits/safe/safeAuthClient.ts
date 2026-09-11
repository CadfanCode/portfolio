/**
 * The client for `safe-auth`, the Java backend in this repo's `safe-auth/`
 * folder. Four calls, and a fallback for when nothing is listening.
 *
 * ## Live and recorded
 *
 * The exhibit has to work on a static Vercel deploy with no backend running
 * anywhere, and it has to work properly when one is. So every call is tried for
 * real first and the whole flow degrades to a recorded transcript if the
 * service cannot be reached — the same instinct as `whiteboard/blogFeed.ts`,
 * which resolves to an empty list rather than letting a dead Blogger feed take
 * the board down with it.
 *
 * One distinction matters more than it looks. A **network** failure — nothing
 * listening, DNS gone, a cold container still booting past the timeout — means
 * we could not ask, and the exhibit falls back to the recording. An **HTTP
 * 401** means we asked and were told no, and that is a real answer that must be
 * shown as one. Papering a genuine refusal over with a recorded success would
 * turn the one moment this exhibit exists to demonstrate into a lie.
 *
 * ## The base URL
 *
 * `VITE_SAFE_AUTH_URL` if set, otherwise `/safe-auth`, which `vite.config.ts`
 * proxies to `localhost:8080` in development so that nothing is cross-origin
 * while you work. On a deploy with no backend the relative path 404s fast,
 * which is exactly the fallback path and costs nothing.
 */

/** Matches `blogFeed.ts`'s budget. Long enough for a cold JVM on a free tier
 *  to wake, short enough that a visitor does not think the page has hung. */
const TIMEOUT_MS = 8000

const BASE_URL = import.meta.env.VITE_SAFE_AUTH_URL ?? '/safe-auth'

export type CardSummary = { id: string; displayName: string }

export type TokenClaims = {
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  auth_time?: number
  scope?: string
  card_id?: string
}

/** Thrown only when the service answered and the answer was a refusal. A
 *  failure to reach it at all is never this — see the module doc. */
export class SafeAuthRefused extends Error {
  // Declared and assigned rather than written as constructor parameter
  // properties: `erasableSyntaxOnly` is on in this project, and a parameter
  // property is the one bit of TypeScript class syntax that cannot be erased
  // because it emits an assignment of its own.
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Thrown when something answered but it was not this API.
 *
 * The case that matters is a single-page-app catch-all. Deployed as a static
 * site with no backend, a request to `/safe-auth/api/cards` does not 404 — the
 * host serves `index.html` for every unmatched path, with a 200. A client that
 * only checks `response.ok` reads that as success and goes on to use a page of
 * HTML as a certificate. So every response is checked for the shape it should
 * have, and anything else is treated exactly like not being able to reach the
 * service at all, which is what it actually means.
 */
class NotThisApi extends Error {}

/** A fetch with a deadline. Any network-level problem, and the timeout itself,
 *  surface as a thrown error the caller treats as "unreachable". */
async function call(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

/** Reads the refusal body the backend sends, falling back to the bare status
 *  if it is not the JSON shape we expect — an intermediary can return a 401
 *  that never came from our service at all. */
async function refusalFrom(response: Response): Promise<SafeAuthRefused> {
  let code = 'invalid_card'
  let message = `The safe refused the card (HTTP ${response.status})`
  try {
    const body = (await response.json()) as { error?: string; message?: string }
    if (body.error) code = body.error
    if (body.message) message = body.message
  } catch {
    // Body was not JSON. The status is still the answer.
  }
  return new SafeAuthRefused(response.status, code, message)
}

/**
 * Wakes a sleeping backend and reports whether one is there.
 *
 * Called when the visitor reaches the cockpit, not when they touch the safe.
 * The camera path from there to the cabin is authored and slow, so a container
 * that needs five seconds to boot has spent them before anyone reaches for a
 * card. Never throws — a false here simply means the exhibit will run recorded.
 */
export async function warm(): Promise<boolean> {
  try {
    const response = await call('/api/cards')
    return response.ok
  } catch {
    return false
  }
}

/** Parses a response that must be JSON, rejecting an HTML catch-all page. */
async function asJson<T>(response: Response, what: string): Promise<T> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) {
    throw new NotThisApi(`${what} did not come back as JSON (got "${type}")`)
  }
  try {
    return (await response.json()) as T
  } catch {
    // The body claimed to be JSON and was not. Deliberately not chained as a
    // cause: what reaches the exhibit either way is "there is no backend
    // here", and a parser's message about an unexpected token would say
    // nothing a visitor or a reader of this code could use.
    throw new NotThisApi(`${what} was not readable JSON`)
  }
}

export async function listCards(): Promise<CardSummary[]> {
  const response = await call('/api/cards')
  if (!response.ok) throw new Error(`Could not list cards (HTTP ${response.status})`)
  return await asJson<CardSummary[]>(response, 'The card list')
}

/** The certificate is fetched at tap time and never cached across a session.
 *  The backend generates its root CA in memory at startup, so a restart makes
 *  every previously issued certificate worthless — a PEM held from yesterday
 *  would fail verification today for reasons nothing in the UI could explain. */
export async function fetchCertificate(cardId: string): Promise<string> {
  const response = await call(`/api/cards/${encodeURIComponent(cardId)}/certificate`)
  if (!response.ok) throw new Error(`No certificate for ${cardId} (HTTP ${response.status})`)
  const pem = await response.text()
  // The cheapest possible check that this is a certificate and not a web page.
  // It proves nothing about validity — that is the server's job, and it will
  // reject anything malformed — but it does stop an HTML catch-all being
  // posted to /api/tap as though it were a card.
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new NotThisApi(`What came back for ${cardId} is not a PEM certificate`)
  }
  return pem
}

export type TapTokens = { idToken: string; accessToken: string; expiresIn: number }

export async function tap(certificatePem: string, passcode: string): Promise<TapTokens> {
  const response = await call('/api/tap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ certificatePem, passcode }),
  })
  // 401 is an answer, not a failure to get one.
  if (response.status === 401) throw await refusalFrom(response)
  if (!response.ok) throw new Error(`Tap failed (HTTP ${response.status})`)
  return await asJson<TapTokens>(response, 'The tap response')
}

export async function openSafe(accessToken: string): Promise<string[]> {
  const response = await call('/api/safe', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (response.status === 401 || response.status === 403) throw await refusalFrom(response)
  if (!response.ok) throw new Error(`Could not open the safe (HTTP ${response.status})`)
  const body = await asJson<{ items?: string[] }>(response, "The safe's contents")
  return body.items ?? []
}

/**
 * Decodes a JWT's payload for display.
 *
 * Display, and nothing else. This reads the claims without checking the
 * signature, which is precisely what no client should ever do to decide
 * anything — an unverified payload is attacker-controlled text. It is safe here
 * for the one reason that makes it safe anywhere: nothing is decided on the
 * result. The server already validated this token before the safe opened, and
 * these claims are being printed so a visitor can read what a JWT actually
 * contains. The real verification is `TokenValidator.java`, and the public key
 * to do it yourself is at `/.well-known/jwks.json`.
 */
export function decodeClaims(jwt: string): TokenClaims | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))) as TokenClaims
  } catch {
    return null
  }
}

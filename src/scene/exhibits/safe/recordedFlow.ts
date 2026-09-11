/**
 * A real tap, captured and kept.
 *
 * The exhibit tries the live backend first and falls back to this when nothing
 * answers — which on a static Vercel deploy with no container running anywhere
 * is every time. The distinction the client draws is in `safeAuthClient.ts`: a
 * network failure lands here, an HTTP 401 never does.
 *
 * ## These are genuine
 *
 * Every token below came out of `safe-auth` running locally on 2026-09-11,
 * by tapping each card with its real passcode and reading what came back. They
 * are not hand-written to look plausible. Decode one and the claims are the
 * claims `IdTokenIssuer`/`AccessTokenIssuer` actually produce, and the
 * signature is a real ES256 signature over them.
 *
 * Two consequences worth knowing rather than hiding:
 *
 * The `exp` in these is long past — an access token lives five minutes and
 * these were minted well over five minutes ago. A visitor who decodes one and
 * notices is seeing the truth about bearer tokens, not a bug, and the panel
 * says so rather than quietly rewriting the timestamp to keep up appearances.
 *
 * The `kid` will not match a live `/.well-known/jwks.json`. `safe-auth`
 * generates its root CA in memory at startup and writes nothing to disk, so
 * every restart is a new key and a new key id. That is the same property that
 * makes the live path re-fetch a certificate at tap time instead of caching it.
 *
 * Regenerate by running the backend and re-capturing — there is no build step
 * that does it, and it is not worth one for a file that changes when the demo
 * changes and at no other time.
 */

export type RecordedFlow = {
  idToken: string
  accessToken: string
  expiresIn: number
  items: string[]
}

/** Keyed by card id, matching `SAFE_CARDS` in `content/safe.ts`. */
export const RECORDED_FLOWS: Record<string, RecordedFlow> = {
  'card-blue': {
    idToken:
      "eyJraWQiOiI4bWpCWUJtYnNpQVBSSVZaQ0F1V2RwSW1WaVlvbklreGZlZEdwN0NoN09zIiwiYWxnIjoiRVMyNTYifQ.eyJzdWIiOiIyMmQ0OThmMzQzMDU1Njg0Zjg1M2QzYjY5NTgyMWI5OCIsImF1ZCI6InNhZmUtYXV0aC1kZW1vIiwiYXV0aF90aW1lIjoxNzg5MTQ2ODE0LCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJleHAiOjE3ODkxNDc0MTQsImlhdCI6MTc4OTE0NjgxNCwiY2FyZF9pZCI6ImNhcmQtYmx1ZSJ9.jmtfIIJhmTqgXYHQiSlL3E0L9W9YU5KIAnEXcPXO3D16sFu4BjMgOdiWNtMl7-F2UhsH3xNic_Ic2kGN6ZiwQQ",
    accessToken:
      "eyJraWQiOiI4bWpCWUJtYnNpQVBSSVZaQ0F1V2RwSW1WaVlvbklreGZlZEdwN0NoN09zIiwiYWxnIjoiRVMyNTYifQ.eyJzdWIiOiIyMmQ0OThmMzQzMDU1Njg0Zjg1M2QzYjY5NTgyMWI5OCIsImF1ZCI6InNhZmUtYXV0aC1kZW1vIiwic2NvcGUiOiJzYWZlOmJvYXQiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJleHAiOjE3ODkxNDcxMTQsImlhdCI6MTc4OTE0NjgxNCwiY2FyZF9pZCI6ImNhcmQtYmx1ZSJ9.6DVlmZt6-jzQcVhBkXcarsGQFP56kjJl6LCQA4WEmJ0GMiPwSmxfW9Z4fRNwnRZovw1u1NcDJt05CfwLdbvwBA",
    expiresIn: 300,
    items: ["boat"],
  },
  'card-red': {
    idToken:
      "eyJraWQiOiI4bWpCWUJtYnNpQVBSSVZaQ0F1V2RwSW1WaVlvbklreGZlZEdwN0NoN09zIiwiYWxnIjoiRVMyNTYifQ.eyJzdWIiOiI1OWY0NzEwNDA2MTU3OWVhNTcyYzQyZDMxYzFhYTlmNSIsImF1ZCI6InNhZmUtYXV0aC1kZW1vIiwiYXV0aF90aW1lIjoxNzg5MTQ2ODE1LCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJleHAiOjE3ODkxNDc0MTUsImlhdCI6MTc4OTE0NjgxNSwiY2FyZF9pZCI6ImNhcmQtcmVkIn0.qqKos-6pdwlQm7987_YerVXp6QDQcC9Cr5ktq306eFjgKwiwiiJWdLKHXNkT_WR7p1iPn6rygoWrErIkpPBV8A",
    accessToken:
      "eyJraWQiOiI4bWpCWUJtYnNpQVBSSVZaQ0F1V2RwSW1WaVlvbklreGZlZEdwN0NoN09zIiwiYWxnIjoiRVMyNTYifQ.eyJzdWIiOiI1OWY0NzEwNDA2MTU3OWVhNTcyYzQyZDMxYzFhYTlmNSIsImF1ZCI6InNhZmUtYXV0aC1kZW1vIiwic2NvcGUiOiJzYWZlOmJvYXQgc2FmZTprZXkiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJleHAiOjE3ODkxNDcxMTUsImlhdCI6MTc4OTE0NjgxNSwiY2FyZF9pZCI6ImNhcmQtcmVkIn0.DS1vn-Ztj0tZi7d7PNNkbhhOz610Kdd-XJwCI3uea7Aok4WlX3lMy7RPvU48pX47yRP1uyzGxFrIlVfZJktxtQ",
    expiresIn: 300,
    items: ["boat", "key"],
  },
}

/** The JWK set as it was at capture time, so the exhibit can show a visitor
 *  the public key that verifies the tokens above even with nothing running. */
export const RECORDED_JWKS = {
  "keys": [
    {
      "kty": "EC",
      "use": "sig",
      "crv": "P-256",
      "kid": "8mjBYBmbsiAPRIVZCAuWdpImViYonIkxfedGp7Ch7Os",
      "x": "oiioU_PeZnyk8T5bdv7d2NJMbYDQNwzFsbQMfXVVxho",
      "y": "s8QSzkZpDto7S6QIMyVEYAqycj7d82W7GpypGdRD11M",
      "alg": "ES256"
    }
  ]
} as const

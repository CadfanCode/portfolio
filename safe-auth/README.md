# safe-auth

A small, heavily commented Java backend that models a physical access-control system:
a keycard is tapped against a safe, a passcode is entered, and the safe opens to reveal
exactly what that card is entitled to see.

Underneath, every part of that metaphor is a real mechanism:

| In the story | In the code |
|---|---|
| Tapping a card | Presenting an X.509 client certificate for verification against a trusted CA |
| The passcode | A PIN checked against a salted PBKDF2 hash |
| Who tapped | An OpenID Connect **ID token** |
| What they may open | An OAuth-style **access token** carrying scopes |
| What is in the safe | Filtered entirely by those scopes |

It exists to be read. Classes are small and single-purpose, every cryptographic step is
commented in plain English, and there is no Spring Security — the token validation is
written out by hand precisely because that logic is the interesting part.

---

## Running it

Java 21 is the only prerequisite; the Maven wrapper fetches Maven itself.

```bash
./mvnw spring-boot:run      # starts on http://localhost:8080
./mvnw test                 # the test suite
./demo.sh                   # the whole flow, end to end, in one go
```

On startup it generates a fresh root CA in memory and issues two cards from it. Nothing
is written to disk — no keystore, no database, no PEM files. A restart produces an
entirely new CA, which invalidates every certificate the previous one issued.

**The two demo cards:**

| Card | Passcode | Entitlements | Opens |
|---|---|---|---|
| `card-blue` | `1977` | `safe:boat` | the model boat |
| `card-red` | `7731` | `safe:boat`, `safe:key` | the boat and the key |

---

## One full tap, step by step

**1 · The front end asks what cards exist.** `GET /api/cards` returns ids and display
names only — no certificates, no entitlements, nothing secret. Enough to draw two cards
on a table.

**2 · The visitor picks up the red card.** `GET /api/cards/card-red/certificate` returns
PEM text. This is public information by design: a certificate is a *signed statement
about a public key*, and handing it out gives nothing away. Holding it is not
authentication, any more than knowing someone's name is proof you are them.

**3 · The card is tapped, and a passcode entered.** `POST /api/tap` receives the PEM and
the passcode. The server verifies the certificate **before** it looks at the passcode,
and the order matters: the passcode is meaningless until we know whose card it belongs
to, and checking an unverified card's passcode leaks whether that card exists.

Verification is five steps, failing closed at the first problem
(`pki/CertificateChainVerifier.java`):

1. **Parse** the PEM into an X.509 structure. Proves only that it is well-formed.
2. **Check the issuer name** against our root CA's subject. A cheap filter.
3. **Verify the signature** against the root CA's public key. *This is the only step
   that proves anything.*
4. **Check the validity window** against the clock.
5. **Read the entitlements** out of the custom extension.

Step 3 is where a forged card dies. A rogue CA can copy our issuer name exactly — anyone
impersonating us would — so step 2 waves it straight through. What it cannot do is
produce a signature that verifies against a private key it does not possess.

**4 · The passcode is checked.** `card/PasscodeVault.java` re-derives PBKDF2-HMAC-SHA256
over the supplied passcode with that card's stored salt, at 210,000 iterations, and
compares with a constant-time comparison. Neither passcode exists anywhere in plaintext.

**5 · Two tokens are issued.** Both signed with ES256, both five/ten-minute lived:

- an **ID token** — `iss`, `sub`, `aud`, `iat`, `exp`, `auth_time`, `card_id`. Says *who*.
- an **access token** — the same, plus `scope` taken straight from the certificate's
  entitlement extension. Says *what may be done*.

**6 · The safe is opened.** `GET /api/safe` with `Authorization: Bearer <accessToken>`.
The token is validated — signature, then expiry, then issuer, then audience, in that
order — the `safe:boat` scope is required to open the door at all, and the contents are
then filtered by the scopes present. Blue gets `["boat"]`. Red gets `["boat","key"]`.

---

## Sequence

```
 Front end                     safe-auth                         In-memory CA
     │                             │                                  │
     │                             │  ── at startup ──────────────────►│
     │                             │   generate EC P-256 root CA       │
     │                             │   issue card-blue  (safe:boat)    │
     │                             │   issue card-red   (+ safe:key)   │
     │                             │◄──────────────────────────────────│
     │                             │
     │  GET /api/cards             │
     │────────────────────────────►│
     │  [{card-blue},{card-red}]   │
     │◄────────────────────────────│
     │                             │
     │  GET /api/cards/card-red/certificate
     │────────────────────────────►│
     │  -----BEGIN CERTIFICATE---- │   (public; proves nothing on its own)
     │◄────────────────────────────│
     │                             │
     │  POST /api/tap              │
     │  {certificatePem, passcode} │
     │────────────────────────────►│
     │                             ├─ 1. parse PEM
     │                             ├─ 2. issuer name matches our CA?
     │                             ├─ 3. SIGNATURE verifies vs CA public key?  ◄── the proof
     │                             ├─ 4. inside its validity window?
     │                             ├─ 5. read entitlements from extension 1.3.6.1.4.1.99999.1.1
     │                             ├─ 6. PBKDF2 passcode check, constant-time
     │                             └─ 7. sign ID + access tokens with the CA private key
     │  {idToken, accessToken,     │
     │   expiresIn: 300}           │
     │◄────────────────────────────│
     │                             │
     │  GET /api/safe              │
     │  Authorization: Bearer ...  │
     │────────────────────────────►│
     │                             ├─ signature → exp → iss → aud   (401 on any failure)
     │                             ├─ require scope safe:boat       (403 if absent)
     │                             └─ filter contents by scope
     │  {"items":["boat","key"]}   │
     │◄────────────────────────────│
     │                             │
     │  GET /.well-known/jwks.json │   (how a client verifies the above itself)
     │────────────────────────────►│
     │  {"keys":[{"kty":"EC",...}]}│
     │◄────────────────────────────│
```

---

## Five curl commands

With the server running. `./demo.sh` runs all of this with prettier output.

```bash
# 1 — what is on the table
curl -s http://localhost:8080/api/cards

# 2 — pick up the red card (this is what the front end "taps")
curl -s http://localhost:8080/api/cards/card-red/certificate -o card-red.pem
cat card-red.pem

# 3 — tap it: certificate + passcode, in exchange for tokens
curl -s -X POST http://localhost:8080/api/tap \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json;print(json.dumps({"certificatePem":open("card-red.pem").read(),"passcode":"7731"}))')"

# 4 — open the safe with the access token from step 3
curl -s http://localhost:8080/api/safe \
  -H "Authorization: Bearer <paste accessToken here>"

# 5 — the public key a client would use to verify those tokens without asking us
curl -s http://localhost:8080/.well-known/jwks.json
```

---

## Design notes

### Why EC P-256 rather than RSA 2048

Three reasons, in the order they mattered. The public key is 65 bytes rather than 270, so
the JWK set at `/.well-known/jwks.json` fits on a screen and can actually be read. P-256
is estimated at roughly the strength of RSA 3072 while being far smaller and faster to
sign with. And ES256 is a first-class OIDC signing algorithm, so nothing here is exotic.

The trade-off: RSA with RS256 is still the more common default in the wild, so most
tutorials you cross-reference will show RSA.

### Why the entitlements live inside the certificate

They could sit in a table keyed by card id. Putting them in a custom X.509 extension
(`1.3.6.1.4.1.99999.1.1`, a deliberately fake private-enterprise arc) means they are
covered by the CA's signature. You cannot grant yourself `safe:key` by editing the
extension, because the signature over the whole structure would stop verifying. The
entitlement travels *with* the card, and there is no side table to fall out of sync.

The extension is marked non-critical, so generic tooling — `openssl x509 -text`, a
browser, a load balancer — can still parse the certificate without knowing what a safe
entitlement is. Our own verifier requires it regardless.

```bash
openssl x509 -in card-red.pem -text -noout | grep -A2 99999
```

### Why a real system would not sign tokens with the CA key

Here, `TokenSigner` signs both JWTs with the root CA's private key. That is deliberate:
it makes the join between the PKI half and the OIDC half visible in one place, which is
the point of a learning project. It is also the wrong thing to do in production, for
four reasons:

- **Blast radius.** A CA key is the trust anchor. If it leaks, every certificate it ever
  issued becomes worthless and the entire hierarchy must be rebuilt. A token signing key
  that leaks costs you the tokens signed with it until you rotate — bad, but bounded.
- **Exposure.** A CA private key belongs offline, ideally in an HSM, brought out rarely
  and under ceremony. A token signing key has to be hot on an internet-facing box,
  signing on every login.
- **Rotation rates.** Those two lifetimes are incompatible. CAs live for years; token
  keys should rotate on the order of weeks, and JWKS exists precisely so they can rotate
  without clients noticing.
- **Key usage.** Look at the root certificate's `KeyUsage` extension: `keyCertSign` and
  `cRLSign`. Not `digitalSignature`. By its own certificate's declaration, that key is
  not supposed to be signing JWTs at all.

A real deployment generates a separate signing key, publishes it in the JWK set under its
own `kid`, and rotates it independently of the CA.

### What this tap is not: proof of possession

`POST /api/tap` accepts a certificate and a passcode. The certificate is public — step 2
hands it to anyone who asks — so in effect the passcode is the only secret, and the
"card" is closer to a username than to a credential.

A real smartcard works differently. The private key is generated inside the chip and
never leaves it for the card's whole life. The passcode does not travel to a server; it
unlocks the key *locally*, and the card then proves possession by signing a challenge
the server issued. Cloning a card means extracting a key that is physically designed not
to come out.

The shape that would fix this, and the reason each class in `pki/` keeps the card's key
pair around (`IssuedCard`) rather than discarding it:

```
GET  /api/tap/challenge          → { nonce, expiresIn }
                                   (server remembers the nonce, single-use)
POST /api/tap  { certificatePem, nonce, signature }
                                   verify chain, then verify the signature over
                                   the nonce with the certificate's public key
```

Possession of the certificate then stops being sufficient — you need the private key.
The nonce must be single-use and short-lived, or a captured signature can be replayed.

### Why the clock is injected

Every class that reads the time takes a `java.time.Clock`. It costs one constructor
parameter and means the test for an expired token stands six minutes in the future rather
than sleeping for six minutes.

### A trap worth knowing about

The first version of `CardCertificateIssuer` set the issuer name like this:

```java
new X500Name(ca.certificate().getSubjectX500Principal().getName())   // wrong
```

Every card it issued was rejected as untrusted, by its own CA. `X500Principal.getName()`
emits RFC 2253, which lists the parts of a name in the *reverse* of their DER order;
`X500Name(String)` then parses them back in the order written. The name reads identically
in a log line and encodes backwards, and RFC 5280 §4.1.2.4 requires a child's issuer
field to match its parent's subject field by exact binary comparison. Take the DER
directly and the problem disappears:

```java
X500Name.getInstance(ca.certificate().getSubjectX500Principal().getEncoded())   // right
```

---

## Layout

```
se.example.safeauth
  ├── pki/     root CA generation, card issuance, chain verification, the custom extension
  ├── card/    the two cards, PBKDF2 passcodes, entitlement → contents mapping
  ├── token/   ID and access token issuing, hand-written JWT validation, the JWK set
  ├── api/     controllers, DTOs, and the exception → status mapping
  └── config/  bean wiring only; no logic lives here
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cards` | Card ids and display names. Also the warm-up ping. |
| GET | `/api/cards/{id}/certificate` | That card's certificate as PEM |
| POST | `/api/tap` | `{certificatePem, passcode}` → `{idToken, accessToken, expiresIn}` |
| GET | `/api/safe` | `Authorization: Bearer …` → contents filtered by scope |
| GET | `/.well-known/jwks.json` | The public signing key, in JWK form |

**Statuses.** `401` for anything we cannot believe — unverifiable certificate, wrong
passcode, bad or expired or misaddressed token. `403` for a token we *do* believe that
simply does not permit the action. Conflating the two tells a caller to re-authenticate
when re-authenticating will change nothing.

## Deploying

CORS origins are configurable, so pointing a deployed front end at this needs no code
change:

```yaml
safe-auth:
  issuer: https://your-deployment-url
  cors:
    allowed-origin-patterns: http://localhost:*,https://your-site.vercel.app
```

Note `allowedOriginPatterns`, not `allowedOrigins` — a wildcard port is illegal in the
latter and fails silently.

A `Dockerfile` is included; the image holds no state, so it can scale to zero freely.
Remember that each cold start generates a new CA and invalidates previously issued
certificates, so a client must fetch a card's PEM at tap time rather than caching it
across sessions.

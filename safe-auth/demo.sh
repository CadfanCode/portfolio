#!/usr/bin/env bash
# The whole tap-to-open flow, in order, against a running safe-auth.
#
#   Terminal 1:  ./mvnw spring-boot:run
#   Terminal 2:  ./demo.sh
#
# Needs curl. Uses jq if present, falls back to raw output if not.

set -uo pipefail
BASE="${BASE:-http://localhost:8080}"

if command -v jq >/dev/null 2>&1; then pretty() { jq .; }; else pretty() { cat; echo; }; fi
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
run()  { printf '\033[2m$ %s\033[0m\n' "$1"; }

step "1. Which cards are on the table?"
run "curl -s $BASE/api/cards"
curl -s "$BASE/api/cards" | pretty

step "2. Pick up the red card — this is the certificate the front end 'taps'"
run "curl -s $BASE/api/cards/card-red/certificate"
CERT=$(curl -s "$BASE/api/cards/card-red/certificate")
echo "$CERT" | head -3
echo "   ... $(echo "$CERT" | wc -l) lines of PEM ..."
echo "$CERT" | tail -1

step "3. Tap it with the wrong passcode — expect 401"
run "curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/tap  (passcode 0000)"
CERT_JSON=$(printf '%s' "$CERT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
printf '   HTTP %s\n' "$(curl -s -o /tmp/safe-auth-wrong.json -w '%{http_code}' \
  -X POST "$BASE/api/tap" -H 'Content-Type: application/json' \
  -d "{\"certificatePem\": $CERT_JSON, \"passcode\": \"0000\"}")"
cat /tmp/safe-auth-wrong.json | pretty

step "4. Tap it with the right passcode — 7731 — and get tokens"
run "curl -s -X POST $BASE/api/tap  (passcode 7731)"
TOKENS=$(curl -s -X POST "$BASE/api/tap" -H 'Content-Type: application/json' \
  -d "{\"certificatePem\": $CERT_JSON, \"passcode\": \"7731\"}")
echo "$TOKENS" | pretty
ACCESS=$(printf '%s' "$TOKENS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')

echo
echo "   The access token's payload, decoded (a JWT is signed, not encrypted):"
printf '%s' "$ACCESS" | cut -d. -f2 | python3 -c '
import sys, base64, json
p = sys.stdin.read().strip()
print("   " + json.dumps(json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))), indent=2).replace("\n", "\n   "))'

step "5. Open the safe with that token"
run "curl -s $BASE/api/safe -H 'Authorization: Bearer ...'"
curl -s "$BASE/api/safe" -H "Authorization: Bearer $ACCESS" | pretty

step "Bonus: the blue card only gets the boat"
BLUE=$(curl -s "$BASE/api/cards/card-blue/certificate")
BLUE_JSON=$(printf '%s' "$BLUE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
BLUE_ACCESS=$(curl -s -X POST "$BASE/api/tap" -H 'Content-Type: application/json' \
  -d "{\"certificatePem\": $BLUE_JSON, \"passcode\": \"1977\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
curl -s "$BASE/api/safe" -H "Authorization: Bearer $BLUE_ACCESS" | pretty

step "Bonus: no token at all — expect 401"
printf '   HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/safe")"

step "Bonus: the public key a client would verify these tokens with"
run "curl -s $BASE/.well-known/jwks.json"
curl -s "$BASE/.well-known/jwks.json" | pretty

rm -f /tmp/safe-auth-wrong.json

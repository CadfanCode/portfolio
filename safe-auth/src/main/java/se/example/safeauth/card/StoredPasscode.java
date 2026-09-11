package se.example.safeauth.card;

/**
 * A passcode as it is safe to keep: a random salt, and the PBKDF2 output derived from
 * the passcode and that salt.
 *
 * <p>The passcode itself is never stored, so this record cannot leak one. Recovering
 * "1977" from these bytes means running the key derivation forwards for every candidate
 * — which is exactly the work {@link PasscodeHasher}'s iteration count is tuned to make
 * expensive.
 *
 * @param salt       16 random bytes, unique per card
 * @param hash       the derived key
 * @param iterations recorded alongside so the cost can be raised later without
 *                   invalidating existing entries
 */
public record StoredPasscode(byte[] salt, byte[] hash, int iterations) {
}

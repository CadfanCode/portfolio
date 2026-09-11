package se.example.safeauth.card;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.nio.charset.StandardCharsets;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Derives and checks passcode hashes with PBKDF2-HMAC-SHA256.
 *
 * <p>Two ideas do the work here.
 *
 * <p><strong>Salt.</strong> Sixteen random bytes are mixed into the derivation and stored
 * in the clear beside the result. A salt is not secret; its job is to make every stored
 * hash unique even when two cards share a passcode, which defeats precomputed rainbow
 * tables and stops an attacker cracking every entry with one pass.
 *
 * <p><strong>Iterations.</strong> A four-digit passcode has only ten thousand
 * possibilities, so it cannot be made genuinely hard to guess — but it can be made slow.
 * 210,000 iterations is OWASP's current figure for PBKDF2-HMAC-SHA256, chosen so a single
 * check costs a user a few milliseconds and costs an attacker the same few milliseconds
 * multiplied by the whole search space.
 *
 * <p>For a system where passcodes matter, prefer a memory-hard function — Argon2id or
 * scrypt. PBKDF2 is here because it is in the JDK and so needs no extra dependency to
 * read.
 */
public final class PasscodeHasher {

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATIONS = 210_000;
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;

    private final SecureRandom random = new SecureRandom();

    /** Hashes a passcode under a fresh random salt. Called once per card at startup. */
    public StoredPasscode hash(String passcode) {
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        return new StoredPasscode(salt, derive(passcode, salt, ITERATIONS), ITERATIONS);
    }

    /**
     * Checks a candidate passcode against a stored hash.
     *
     * <p>Re-derives with the stored salt and iteration count, then compares with
     * {@link MessageDigest#isEqual}, which does not stop at the first differing byte.
     * A naive {@code Arrays.equals} returns fractionally sooner on a near-miss, and that
     * timing difference is enough to let an attacker recover a hash one byte at a time.
     */
    public boolean matches(String passcode, StoredPasscode stored) {
        if (passcode == null) {
            return false;
        }
        byte[] candidate = derive(passcode, stored.salt(), stored.iterations());
        return MessageDigest.isEqual(candidate, stored.hash());
    }

    private byte[] derive(String passcode, byte[] salt, int iterations) {
        // PBEKeySpec takes the passcode as a char[] rather than a String so it can be
        // wiped after use — a String would linger in the heap until garbage collected.
        PBEKeySpec spec = new PBEKeySpec(passcode.toCharArray(), salt, iterations, KEY_BITS);
        try {
            return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new IllegalStateException("PBKDF2 is unavailable in this JVM", e);
        } finally {
            spec.clearPassword();
        }
    }

    /** Not used by the flow; kept so the README's curl examples can show a digest. */
    static byte[] utf8(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}

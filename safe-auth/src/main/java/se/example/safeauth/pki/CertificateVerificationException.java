package se.example.safeauth.pki;

/**
 * Thrown when a presented certificate fails any step of verification.
 *
 * <p>Carries a {@link Reason} rather than just a message so the API layer can decide
 * the HTTP status without string-matching. Every reason maps to 401: a card we cannot
 * verify is a card we do not know, and we fail closed.
 */
public class CertificateVerificationException extends RuntimeException {

    /** The four checks a card must pass, plus the parse that precedes them. */
    public enum Reason {
        MALFORMED_PEM,
        UNTRUSTED_ISSUER,
        BAD_SIGNATURE,
        NOT_YET_VALID,
        EXPIRED,
        MISSING_ENTITLEMENTS
    }

    private final Reason reason;

    public CertificateVerificationException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public CertificateVerificationException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}

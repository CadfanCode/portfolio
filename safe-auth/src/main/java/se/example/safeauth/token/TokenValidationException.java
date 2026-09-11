package se.example.safeauth.token;

/**
 * Thrown when a bearer token is unusable.
 *
 * <p>The {@link Reason} carries the one distinction the API layer cares about: 401 means
 * "I do not believe this token", 403 means "I believe it, and it still does not let you
 * do that". Conflating them is a common bug — it tells a caller to go and re-authenticate
 * when re-authenticating will change nothing.
 */
public class TokenValidationException extends RuntimeException {

    public enum Reason {
        MISSING(401),
        MALFORMED(401),
        BAD_SIGNATURE(401),
        EXPIRED(401),
        WRONG_ISSUER(401),
        WRONG_AUDIENCE(401),
        INSUFFICIENT_SCOPE(403);

        private final int status;

        Reason(int status) {
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    private final Reason reason;

    public TokenValidationException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public TokenValidationException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}

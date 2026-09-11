package se.example.safeauth.api;

import se.example.safeauth.token.TokenValidationException;
import se.example.safeauth.token.TokenValidationException.Reason;

/**
 * Pulls the raw JWT out of an Authorization header.
 *
 * <p>Ten lines of work, and its own class, because every branch in it is a different way
 * of being handed nothing: no header at all, a header in some other scheme, or the word
 * Bearer with an empty string behind it. All three mean the same thing — MISSING, and a
 * 401 — and none of them may be allowed to reach {@code TokenValidator} as a null and
 * come back out as a 500. A parse failure at the edge is still an authentication failure.
 */
public final class BearerTokenExtractor {

    private static final String SCHEME = "Bearer";

    private BearerTokenExtractor() {
    }

    /** Returns the token, or throws with {@link Reason#MISSING}. Never returns null. */
    public static String bearerToken(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            throw new TokenValidationException(Reason.MISSING, "No Authorization header was sent");
        }

        String header = authorizationHeader.trim();

        // The scheme name is compared case-insensitively because RFC 7235 says it is a
        // case-insensitive token, and RFC 6750 inherits that — "bearer eyJ..." from a
        // client that normalised its headers to lower case is a valid request. The common
        // mistake is startsWith("Bearer "), which rejects it. The token itself is
        // case-sensitive base64url and is never folded.
        //
        // regionMatches(true, ...) rather than toLowerCase(): lowercasing is locale
        // sensitive, and in a Turkish locale "BEARER".toLowerCase() is not "bearer".
        boolean schemeMatches = header.length() > SCHEME.length()
                && header.regionMatches(true, 0, SCHEME, 0, SCHEME.length())
                && Character.isWhitespace(header.charAt(SCHEME.length()));
        if (!schemeMatches) {
            throw new TokenValidationException(
                    Reason.MISSING, "Authorization header does not use the Bearer scheme");
        }

        String token = header.substring(SCHEME.length()).trim();
        if (token.isEmpty()) {
            throw new TokenValidationException(
                    Reason.MISSING, "Authorization header carries an empty bearer token");
        }
        return token;
    }
}

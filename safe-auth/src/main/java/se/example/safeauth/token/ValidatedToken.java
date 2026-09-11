package se.example.safeauth.token;

import java.time.Instant;
import java.util.List;

/**
 * A token that has passed every check, reduced to the facts the API layer needs.
 *
 * <p>As with VerifiedCard, the type is the proof: only {@link TokenValidator} can build
 * one, and only after signature, expiry, issuer and audience have all passed. Code that
 * holds a ValidatedToken does not need to re-check anything.
 */
public record ValidatedToken(String subject, String cardId, List<String> scopes, Instant expiresAt) {

    public boolean hasScope(String scope) {
        return scopes.contains(scope);
    }
}

package se.example.safeauth.token;

import se.example.safeauth.token.TokenValidationException.Reason;

/**
 * Enforces that a validated token carries a required scope.
 *
 * <p>Deliberately a separate step from validation. Validation asks "is this token real?"
 * and answers 401; this asks "does it permit this?" and answers 403. Keeping them apart
 * is what stops the two statuses getting muddled, and means a new endpoint has to name
 * the scope it needs rather than inheriting someone else's.
 */
public final class ScopeGuard {

    /** Throws with a 403 reason if the scope is absent. Returns quietly if present. */
    public void require(ValidatedToken token, String scope) {
        if (!token.hasScope(scope)) {
            throw new TokenValidationException(
                    Reason.INSUFFICIENT_SCOPE,
                    "Token does not carry the required scope " + scope);
        }
    }
}

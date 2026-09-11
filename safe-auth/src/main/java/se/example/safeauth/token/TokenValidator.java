package se.example.safeauth.token;

import java.security.interfaces.ECPublicKey;
import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import se.example.safeauth.pki.RootCertificateAuthority;
import se.example.safeauth.token.TokenValidationException.Reason;

/**
 * Validates a bearer token. Written out by hand rather than delegated to Spring Security,
 * because the order of these checks is the lesson.
 *
 * <p>Signature first, always. Every claim in a JWT is attacker-controlled text until the
 * signature has been verified — reading {@code iss} or {@code exp} from an unverified
 * token and acting on it is trusting the attacker's own description of their token. Only
 * once the signature holds do the claims mean anything.
 *
 * <p>Then expiry, issuer and audience. Each is a separate reason to refuse, and all of
 * them fail closed: anything we cannot affirmatively confirm is a rejection, never a
 * default-allow.
 */
public final class TokenValidator {

    private final ECDSAVerifier verifier;
    private final TokenSettings settings;
    private final Clock clock;

    public TokenValidator(RootCertificateAuthority ca, TokenSettings settings, Clock clock) {
        try {
            // The public half of the same key that signed the token. This is precisely
            // what a client would fetch from /.well-known/jwks.json and use instead.
            this.verifier = new ECDSAVerifier((ECPublicKey) ca.publicKey());
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not build a verifier from the root CA key", e);
        }
        this.settings = settings;
        this.clock = clock;
    }

    public ValidatedToken validate(String token) {
        if (token == null || token.isBlank()) {
            throw new TokenValidationException(Reason.MISSING, "No bearer token was presented");
        }

        SignedJWT jwt = parse(token);
        verifySignature(jwt);

        JWTClaimsSet claims = claimsOf(jwt);
        checkExpiry(claims);
        checkIssuer(claims);
        checkAudience(claims);

        return new ValidatedToken(
                claims.getSubject(),
                stringClaim(claims, "card_id"),
                scopesOf(claims),
                claims.getExpirationTime().toInstant());
    }

    private SignedJWT parse(String token) {
        try {
            return SignedJWT.parse(token);
        } catch (ParseException e) {
            throw new TokenValidationException(Reason.MALFORMED, "Bearer token is not a well-formed JWT", e);
        }
    }

    /** Step 1: recompute the signature over header and payload and compare. */
    private void verifySignature(SignedJWT jwt) {
        try {
            if (!jwt.verify(verifier)) {
                throw new TokenValidationException(
                        Reason.BAD_SIGNATURE, "Token signature does not verify against this service's key");
            }
        } catch (JOSEException e) {
            throw new TokenValidationException(Reason.BAD_SIGNATURE, "Token signature could not be checked", e);
        }
    }

    /** Step 2: a token with no expiry is refused outright, not treated as eternal. */
    private void checkExpiry(JWTClaimsSet claims) {
        Date expiry = claims.getExpirationTime();
        if (expiry == null) {
            throw new TokenValidationException(Reason.EXPIRED, "Token carries no expiry claim");
        }
        if (!Instant.now(clock).isBefore(expiry.toInstant())) {
            throw new TokenValidationException(Reason.EXPIRED, "Token expired at " + expiry.toInstant());
        }
    }

    /** Step 3: minted by us, not by someone else holding a valid-looking key. */
    private void checkIssuer(JWTClaimsSet claims) {
        if (!settings.issuer().equals(claims.getIssuer())) {
            throw new TokenValidationException(
                    Reason.WRONG_ISSUER, "Token was issued by " + claims.getIssuer() + ", not by this service");
        }
    }

    /** Step 4: meant for us, not merely valid somewhere else. */
    private void checkAudience(JWTClaimsSet claims) {
        List<String> audience = claims.getAudience();
        if (audience == null || !audience.contains(settings.audience())) {
            throw new TokenValidationException(
                    Reason.WRONG_AUDIENCE, "Token audience does not include " + settings.audience());
        }
    }

    private JWTClaimsSet claimsOf(SignedJWT jwt) {
        try {
            return jwt.getJWTClaimsSet();
        } catch (ParseException e) {
            throw new TokenValidationException(Reason.MALFORMED, "Token payload is not a readable claims set", e);
        }
    }

    /** "scope" is one space-delimited string per OAuth 2; split it back into a list. */
    private static List<String> scopesOf(JWTClaimsSet claims) {
        String scope = stringClaim(claims, "scope");
        if (scope == null || scope.isBlank()) {
            return List.of();
        }
        return Arrays.stream(scope.trim().split("\\s+")).toList();
    }

    private static String stringClaim(JWTClaimsSet claims, String name) {
        try {
            return claims.getStringClaim(name);
        } catch (ParseException e) {
            return null;
        }
    }
}

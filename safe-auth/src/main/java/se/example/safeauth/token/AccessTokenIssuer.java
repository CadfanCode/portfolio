package se.example.safeauth.token;

import java.time.Clock;
import java.time.Instant;
import java.util.Date;

import com.nimbusds.jwt.JWTClaimsSet;

import se.example.safeauth.pki.VerifiedCard;

/**
 * Issues the OAuth-style access token: an assertion about <em>what may be done</em>.
 *
 * <p>The scopes come straight from the verified certificate's custom extension, so the
 * chain from CA signature to safe contents is unbroken: the CA signed the entitlements,
 * we re-verified that signature, and we now restate those same entitlements as scopes.
 * Nothing is looked up in a side table along the way, so there is nothing to fall out of
 * sync with the certificate.
 *
 * <p>Five minutes is short deliberately. A bearer token is exactly as good as possession
 * — whoever holds it can use it — so the only real defence against a leaked one is that
 * it stops working quickly.
 */
public final class AccessTokenIssuer {

    private final TokenSigner signer;
    private final TokenSettings settings;
    private final Clock clock;

    public AccessTokenIssuer(TokenSigner signer, TokenSettings settings, Clock clock) {
        this.signer = signer;
        this.settings = settings;
        this.clock = clock;
    }

    public String issue(VerifiedCard card) {
        Instant now = clock.instant();
        Instant expiry = now.plus(settings.accessTokenLifetime());

        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(settings.issuer())
                .subject(card.serialHex())
                .audience(settings.audience())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(expiry))
                // OAuth 2 defines "scope" as a single space-delimited string, not a JSON
                // array. Easy to get wrong, and a client written to the spec will fail to
                // parse an array.
                .claim("scope", String.join(" ", card.entitlements()))
                .claim("card_id", card.cardId())
                .build();

        return signer.sign(claims);
    }

    /** Seconds until an access token issued now would expire; the expires_in field. */
    public long expiresInSeconds() {
        return settings.accessTokenLifetime().toSeconds();
    }
}

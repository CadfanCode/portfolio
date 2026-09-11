package se.example.safeauth.token;

import java.time.Clock;
import java.time.Instant;
import java.util.Date;

import com.nimbusds.jwt.JWTClaimsSet;

import se.example.safeauth.pki.VerifiedCard;

/**
 * Issues the OpenID Connect ID token: an assertion about <em>who</em> tapped.
 *
 * <p>The distinction between the two tokens this service issues is the thing worth
 * internalising. An ID token answers "who is this?" and is meant to be consumed by the
 * client that requested the login. An access token answers "what may they do?" and is
 * meant to be presented to an API. Sending an ID token to an API as a bearer credential
 * is a classic mistake: it carries no scopes, so the API has nothing to authorise against.
 */
public final class IdTokenIssuer {

    private final TokenSigner signer;
    private final TokenSettings settings;
    private final Clock clock;

    public IdTokenIssuer(TokenSigner signer, TokenSettings settings, Clock clock) {
        this.signer = signer;
        this.settings = settings;
        this.clock = clock;
    }

    /**
     * @param card     the card that was just verified
     * @param authTime when authentication actually happened
     */
    public String issue(VerifiedCard card, Instant authTime) {
        Instant now = clock.instant();

        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                // Who says so. A client must check this matches the issuer it trusts.
                .issuer(settings.issuer())
                // Who this is about. The certificate serial: stable for the life of the
                // card, and pseudonymous, so the subject is bound to the issued
                // credential rather than to a guessable name.
                .subject(card.serialHex())
                // Who it is for. A client must check it is in this list.
                .audience(settings.audience())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(settings.idTokenLifetime())))
                // auth_time is separate from iat on purpose: a token can be reissued
                // long after the human actually authenticated, and a relying party that
                // demands a fresh login needs to tell the difference.
                .claim("auth_time", authTime.getEpochSecond())
                // Not a standard OIDC claim; ours, so the front end can tell which card
                // is in the reader without decoding the certificate again.
                .claim("card_id", card.cardId())
                .build();

        return signer.sign(claims);
    }
}

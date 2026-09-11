package se.example.safeauth.token;

import java.time.Duration;

/**
 * The values that must agree between issuing and validating a token.
 *
 * <p>{@code issuer} and {@code audience} exist to stop a token being replayed somewhere
 * it was never meant for. The issuer says who minted it; the audience says who it was
 * minted for. A service that checks the signature but not the audience will happily
 * accept a valid token that was issued for a completely different service — same key,
 * wrong recipient.
 *
 * @param issuer               the {@code iss} claim, this service's own identifier
 * @param audience             the {@code aud} claim, who may accept the token
 * @param idTokenLifetime      how long the identity assertion stays fresh
 * @param accessTokenLifetime  how long the safe stays open; short by design
 */
public record TokenSettings(
        String issuer,
        String audience,
        Duration idTokenLifetime,
        Duration accessTokenLifetime) {
}

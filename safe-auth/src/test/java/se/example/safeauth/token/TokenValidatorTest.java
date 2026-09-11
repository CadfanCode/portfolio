package se.example.safeauth.token;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;

import se.example.safeauth.pki.CardCertificateIssuer;
import se.example.safeauth.pki.CertificateChainVerifier;
import se.example.safeauth.pki.IssuedCard;
import se.example.safeauth.pki.PemCodec;
import se.example.safeauth.pki.RootCaGenerator;
import se.example.safeauth.pki.RootCertificateAuthority;
import se.example.safeauth.pki.VerifiedCard;
import se.example.safeauth.token.TokenValidationException.Reason;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for the four validation steps, each exercised in isolation.
 *
 * <p>Every one of these tokens is perfectly well-formed and correctly signed except where
 * stated. That is the point — a token being real is not the same as a token being
 * acceptable, and each check catches a different way of being unacceptable.
 */
class TokenValidatorTest {

    private static final Instant NOW = Instant.parse("2026-09-11T12:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private static final TokenSettings SETTINGS = new TokenSettings(
            "http://localhost:8080", "safe-auth-demo", Duration.ofMinutes(10), Duration.ofMinutes(5));

    private final RootCaGenerator generator = new RootCaGenerator();
    private final CardCertificateIssuer issuer = new CardCertificateIssuer();

    private VerifiedCard card(RootCertificateAuthority ca, String id, List<String> entitlements) {
        IssuedCard issued = issuer.issue(ca, id, entitlements, CLOCK);
        return new CertificateChainVerifier(ca, CLOCK).verify(PemCodec.toPem(issued.certificate()));
    }

    @Test
    void accepts_a_token_it_just_issued() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        String token = new AccessTokenIssuer(new TokenSigner(ca), SETTINGS, CLOCK)
                .issue(card(ca, "card-red", List.of("safe:boat", "safe:key")));

        ValidatedToken validated = new TokenValidator(ca, SETTINGS, CLOCK).validate(token);

        assertThat(validated.cardId()).isEqualTo("card-red");
        assertThat(validated.scopes()).containsExactly("safe:boat", "safe:key");
        assertThat(validated.hasScope("safe:key")).isTrue();
        assertThat(validated.expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
    }

    @Test
    void refuses_a_token_signed_by_a_different_key() {
        RootCertificateAuthority ours = generator.generate(CLOCK);
        RootCertificateAuthority theirs = generator.generate(CLOCK);

        String foreign = new AccessTokenIssuer(new TokenSigner(theirs), SETTINGS, CLOCK)
                .issue(card(theirs, "card-red", List.of("safe:boat", "safe:key")));

        assertThat(assertThrows(TokenValidationException.class,
                () -> new TokenValidator(ours, SETTINGS, CLOCK).validate(foreign))
                .reason()).isEqualTo(Reason.BAD_SIGNATURE);
    }

    @Test
    void refuses_a_token_after_it_expires() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        String token = new AccessTokenIssuer(new TokenSigner(ca), SETTINGS, CLOCK)
                .issue(card(ca, "card-blue", List.of("safe:boat")));

        // Six minutes on, against a five-minute lifetime. No sleeping required.
        Clock later = Clock.fixed(NOW.plus(Duration.ofMinutes(6)), ZoneOffset.UTC);

        assertThat(assertThrows(TokenValidationException.class,
                () -> new TokenValidator(ca, SETTINGS, later).validate(token))
                .reason()).isEqualTo(Reason.EXPIRED);
    }

    @Test
    void refuses_a_token_minted_by_a_different_issuer() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        TokenSettings elsewhere = new TokenSettings(
                "https://someone-else.example", "safe-auth-demo", Duration.ofMinutes(10), Duration.ofMinutes(5));

        // Same key, same audience, different issuer. Signature-only validation would wave
        // this through.
        String token = new AccessTokenIssuer(new TokenSigner(ca), elsewhere, CLOCK)
                .issue(card(ca, "card-blue", List.of("safe:boat")));

        assertThat(assertThrows(TokenValidationException.class,
                () -> new TokenValidator(ca, SETTINGS, CLOCK).validate(token))
                .reason()).isEqualTo(Reason.WRONG_ISSUER);
    }

    @Test
    void refuses_a_token_meant_for_a_different_audience() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        TokenSettings otherAudience = new TokenSettings(
                "http://localhost:8080", "some-other-service", Duration.ofMinutes(10), Duration.ofMinutes(5));

        // The replay case: a genuine token for a different service, presented to ours.
        String token = new AccessTokenIssuer(new TokenSigner(ca), otherAudience, CLOCK)
                .issue(card(ca, "card-blue", List.of("safe:boat")));

        assertThat(assertThrows(TokenValidationException.class,
                () -> new TokenValidator(ca, SETTINGS, CLOCK).validate(token))
                .reason()).isEqualTo(Reason.WRONG_AUDIENCE);
    }

    @Test
    void refuses_a_tampered_token() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        String token = new AccessTokenIssuer(new TokenSigner(ca), SETTINGS, CLOCK)
                .issue(card(ca, "card-blue", List.of("safe:boat")));

        // Swap the payload for one granting both scopes. The header and signature are
        // untouched, so the token still looks structurally perfect — and fails, because
        // the signature was computed over the payload we just replaced.
        String[] parts = token.split("\\.");
        String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                ("{\"iss\":\"http://localhost:8080\",\"sub\":\"x\",\"aud\":\"safe-auth-demo\","
                        + "\"exp\":" + NOW.plusSeconds(300).getEpochSecond()
                        + ",\"scope\":\"safe:boat safe:key\",\"card_id\":\"card-blue\"}")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String tampered = parts[0] + "." + forgedPayload + "." + parts[2];

        assertThat(assertThrows(TokenValidationException.class,
                () -> new TokenValidator(ca, SETTINGS, CLOCK).validate(tampered))
                .reason()).isEqualTo(Reason.BAD_SIGNATURE);
    }

    @Test
    void refuses_junk_and_nothing() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        TokenValidator validator = new TokenValidator(ca, SETTINGS, CLOCK);

        assertThat(assertThrows(TokenValidationException.class, () -> validator.validate("not-a-jwt"))
                .reason()).isEqualTo(Reason.MALFORMED);
        assertThat(assertThrows(TokenValidationException.class, () -> validator.validate(null))
                .reason()).isEqualTo(Reason.MISSING);
        assertThat(assertThrows(TokenValidationException.class, () -> validator.validate("  "))
                .reason()).isEqualTo(Reason.MISSING);
    }

    @Test
    void id_token_carries_identity_and_no_scopes() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        VerifiedCard red = card(ca, "card-red", List.of("safe:boat", "safe:key"));

        Instant authTime = NOW.minusSeconds(30);
        String idToken = new IdTokenIssuer(new TokenSigner(ca), SETTINGS, CLOCK).issue(red, authTime);

        ValidatedToken validated = new TokenValidator(ca, SETTINGS, CLOCK).validate(idToken);

        assertThat(validated.cardId()).isEqualTo("card-red");
        assertThat(validated.subject()).isEqualTo(red.serialHex());
        // The distinction that matters: an ID token says who, not what. Presenting one
        // to a scoped API gives the API nothing to authorise against.
        assertThat(validated.scopes()).isEmpty();
        assertThat(validated.hasScope("safe:boat")).isFalse();
    }

    @Test
    void scope_guard_separates_401_from_403() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        String blueToken = new AccessTokenIssuer(new TokenSigner(ca), SETTINGS, CLOCK)
                .issue(card(ca, "card-blue", List.of("safe:boat")));

        ValidatedToken blue = new TokenValidator(ca, SETTINGS, CLOCK).validate(blueToken);
        ScopeGuard guard = new ScopeGuard();

        guard.require(blue, "safe:boat");

        TokenValidationException thrown = assertThrows(
                TokenValidationException.class, () -> guard.require(blue, "safe:key"));

        // A real token that does not permit the action: 403, not 401. Re-authenticating
        // with the same card would change nothing.
        assertThat(thrown.reason()).isEqualTo(Reason.INSUFFICIENT_SCOPE);
        assertThat(thrown.reason().status()).isEqualTo(403);
    }
}

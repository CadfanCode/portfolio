package se.example.safeauth.pki;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;

import se.example.safeauth.pki.CertificateVerificationException.Reason;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for the five verification steps.
 *
 * <p>The rogue-CA case is the one that matters, and it is sharper than it looks. Our
 * generator always uses the same subject name, so a second CA built by the same code is
 * named identically to the real one — a forger would obviously copy the name they are
 * impersonating. The issuer-name check therefore passes, and the certificate is caught
 * one step later by the signature check. That is the point: names are a filter, the
 * signature is the proof.
 */
class CertificateChainVerifierTest {

    private static final Instant NOW = Instant.parse("2026-09-11T12:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private final RootCaGenerator generator = new RootCaGenerator();
    private final CardCertificateIssuer issuer = new CardCertificateIssuer();

    @Test
    void accepts_a_card_issued_by_the_trusted_root() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        IssuedCard card = issuer.issue(ca, "card-red", List.of("safe:boat", "safe:key"), CLOCK);

        VerifiedCard verified = new CertificateChainVerifier(ca, CLOCK)
                .verify(PemCodec.toPem(card.certificate()));

        assertThat(verified.cardId()).isEqualTo("card-red");
        assertThat(verified.entitlements()).containsExactly("safe:boat", "safe:key");
        assertThat(verified.serialHex()).isNotBlank();
    }

    @Test
    void rejects_a_card_signed_by_a_rogue_ca() {
        RootCertificateAuthority trusted = generator.generate(CLOCK);
        RootCertificateAuthority rogue = generator.generate(CLOCK);

        // The forger grants themselves both entitlements. It makes no difference: the
        // extension is only as good as the signature over it.
        IssuedCard forged = issuer.issue(rogue, "card-red", List.of("safe:boat", "safe:key"), CLOCK);

        CertificateVerificationException thrown = assertThrows(
                CertificateVerificationException.class,
                () -> new CertificateChainVerifier(trusted, CLOCK).verify(PemCodec.toPem(forged.certificate())));

        assertThat(thrown.reason()).isEqualTo(Reason.BAD_SIGNATURE);
    }

    @Test
    void rejects_a_card_whose_validity_window_has_passed() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        IssuedCard card = issuer.issue(ca, "card-blue", List.of("safe:boat"), CLOCK);

        // Stand two years downstream. The certificate is unchanged and its signature
        // still verifies perfectly — it has simply stopped being a current statement.
        Clock muchLater = Clock.fixed(NOW.plus(Duration.ofDays(730)), ZoneOffset.UTC);

        assertThatThrownBy(() -> new CertificateChainVerifier(ca, muchLater)
                .verify(PemCodec.toPem(card.certificate())))
                .isInstanceOf(CertificateVerificationException.class)
                .extracting(e -> ((CertificateVerificationException) e).reason())
                .isEqualTo(Reason.EXPIRED);
    }

    @Test
    void rejects_a_card_that_is_not_yet_valid() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        IssuedCard card = issuer.issue(ca, "card-blue", List.of("safe:boat"), CLOCK);

        // A day before issuance. notBefore is backdated five minutes for clock skew,
        // so a whole day earlier is comfortably outside it.
        Clock earlier = Clock.fixed(NOW.minus(Duration.ofDays(1)), ZoneOffset.UTC);

        assertThatThrownBy(() -> new CertificateChainVerifier(ca, earlier)
                .verify(PemCodec.toPem(card.certificate())))
                .isInstanceOf(CertificateVerificationException.class)
                .extracting(e -> ((CertificateVerificationException) e).reason())
                .isEqualTo(Reason.NOT_YET_VALID);
    }

    @Test
    void rejects_text_that_is_not_a_certificate() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        CertificateChainVerifier verifier = new CertificateChainVerifier(ca, CLOCK);

        assertThat(assertThrows(CertificateVerificationException.class,
                () -> verifier.verify("hello")).reason()).isEqualTo(Reason.MALFORMED_PEM);

        assertThat(assertThrows(CertificateVerificationException.class,
                () -> verifier.verify("")).reason()).isEqualTo(Reason.MALFORMED_PEM);
    }

    @Test
    void round_trips_a_certificate_through_pem_unchanged() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        IssuedCard card = issuer.issue(ca, "card-blue", List.of("safe:boat"), CLOCK);

        // The signature is computed over the DER bytes, so PEM encoding has to be
        // lossless or verification downstream would fail.
        assertThat(PemCodec.fromPem(PemCodec.toPem(card.certificate())))
                .isEqualTo(card.certificate());
    }

    @Test
    void reads_entitlements_out_of_the_signed_extension() {
        RootCertificateAuthority ca = generator.generate(CLOCK);
        IssuedCard card = issuer.issue(ca, "card-blue", List.of("safe:boat"), CLOCK);

        assertThat(EntitlementExtension.decode(card.certificate())).containsExactly("safe:boat");
    }

    @Test
    void rejects_a_certificate_with_no_entitlement_extension() {
        RootCertificateAuthority ca = generator.generate(CLOCK);

        // The CA's own certificate is signed by the trusted key and is in date, so it
        // passes every step but the last. A valid certificate is still not a valid card.
        assertThat(assertThrows(CertificateVerificationException.class,
                () -> new CertificateChainVerifier(ca, CLOCK).verify(PemCodec.toPem(ca.certificate())))
                .reason()).isEqualTo(Reason.MISSING_ENTITLEMENTS);
    }
}

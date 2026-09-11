package se.example.safeauth.config;

import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.util.HexFormat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import se.example.safeauth.pki.CardCertificateIssuer;
import se.example.safeauth.pki.CertificateChainVerifier;
import se.example.safeauth.pki.RootCaGenerator;
import se.example.safeauth.pki.RootCertificateAuthority;

/**
 * Builds the trust anchor, and the two components that lean on it.
 *
 * <p>The CA is generated in memory as the context starts and is never written to disk.
 * So a restart produces a brand-new CA, and every certificate the old one signed stops
 * verifying the moment it does — including any PEM a visitor saved in a scratch file
 * five minutes ago. That is convenient for a demo with no keystore to manage, and it is
 * also the honest shape of the rule underneath: the lifetime of a trust anchor is the
 * lifetime of everything beneath it. Rotating a real root CA is a migration, not a
 * restart.
 *
 * <p>The startup line prints the subject DN and the certificate's SHA-256 fingerprint.
 * The fingerprint is how you confirm that the CA in the log is the one that signed the
 * card in your hand — comparing distinguished names proves nothing, since anyone can
 * name themselves after us, which is the whole reason certificates are verified by
 * signature rather than by title.
 */
@Configuration
public class PkiConfig {

    private static final Logger log = LoggerFactory.getLogger(PkiConfig.class);

    @Bean
    public RootCertificateAuthority rootCertificateAuthority(Clock clock) {
        RootCertificateAuthority ca = new RootCaGenerator().generate(clock);
        log.info("Root CA generated in memory: {} | SHA-256 {}",
                ca.certificate().getSubjectX500Principal().getName(),
                fingerprint(ca.certificate()));
        return ca;
    }

    @Bean
    public CardCertificateIssuer cardCertificateIssuer() {
        return new CardCertificateIssuer();
    }

    @Bean
    public CertificateChainVerifier certificateChainVerifier(RootCertificateAuthority ca, Clock clock) {
        return new CertificateChainVerifier(ca, clock);
    }

    /**
     * SHA-256 over the certificate's DER bytes — the same number
     * {@code openssl x509 -fingerprint -sha256} prints, colon-separated to match.
     */
    private static String fingerprint(X509Certificate certificate) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded());
            return HexFormat.ofDelimiter(":").withUpperCase().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("Could not fingerprint the root CA certificate", e);
        }
    }
}

package se.example.safeauth.pki;

import java.security.cert.X509Certificate;
import java.time.Clock;
import java.util.Date;
import java.util.List;

import javax.security.auth.x500.X500Principal;

import se.example.safeauth.pki.CertificateVerificationException.Reason;

/**
 * Decides whether a presented certificate is a card this service trusts.
 *
 * <p>This is the tap. Five steps, in this order, failing closed at the first problem:
 *
 * <ol>
 *   <li>parse the PEM into an X.509 structure</li>
 *   <li>check the issuer name matches our root CA's subject name</li>
 *   <li>verify the CA's signature over the certificate</li>
 *   <li>check the validity window against the current time</li>
 *   <li>read the entitlement extension</li>
 * </ol>
 *
 * <p>Step 3 is the one that matters. Steps 2 and 4 are cheap filters over what the
 * certificate <em>claims</em>; only the signature check proves anything. A forged card
 * can copy our issuer name exactly — an attacker who wants to impersonate our CA will
 * obviously name themselves after it — but it cannot produce a signature that verifies
 * against a private key it does not have. That is the whole of PKI in one line.
 *
 * <p><strong>On not using CertPathValidator.</strong> The JDK ships a general chain
 * builder for hierarchies with intermediates, revocation lists and policy constraints.
 * With exactly two levels it would hide the interesting part behind PKIXParameters, so
 * the checks are written out here instead. A deeper hierarchy should use the real thing.
 */
public final class CertificateChainVerifier {

    private final RootCertificateAuthority ca;
    private final Clock clock;

    public CertificateChainVerifier(RootCertificateAuthority ca, Clock clock) {
        this.ca = ca;
        this.clock = clock;
    }

    /** Verifies PEM text, or throws {@link CertificateVerificationException}. */
    public VerifiedCard verify(String pem) {
        X509Certificate certificate = PemCodec.fromPem(pem);

        checkIssuerName(certificate);
        checkSignature(certificate);
        checkValidityPeriod(certificate);

        List<String> entitlements = EntitlementExtension.decode(certificate);
        if (entitlements.isEmpty()) {
            throw new CertificateVerificationException(
                    Reason.MISSING_ENTITLEMENTS, "Card carries no entitlements and can open nothing");
        }

        return new VerifiedCard(
                commonNameOf(certificate.getSubjectX500Principal()),
                entitlements,
                certificate.getSerialNumber().toString(16),
                certificate);
    }

    /**
     * Step 2. Does the certificate even claim to come from us? A cheap string comparison
     * that lets us reject a stranger's card without doing elliptic-curve maths.
     */
    private void checkIssuerName(X509Certificate certificate) {
        X500Principal expected = ca.certificate().getSubjectX500Principal();
        if (!expected.equals(certificate.getIssuerX500Principal())) {
            throw new CertificateVerificationException(
                    Reason.UNTRUSTED_ISSUER,
                    "Certificate was issued by " + certificate.getIssuerX500Principal().getName()
                            + ", which is not this service's trust anchor");
        }
    }

    /**
     * Step 3. The real check. verify() recomputes the hash over the certificate's signed
     * bytes and confirms the signature was produced by the private key matching this
     * public key. A rogue CA reaches this line and fails it.
     */
    private void checkSignature(X509Certificate certificate) {
        try {
            certificate.verify(ca.publicKey());
        } catch (Exception e) {
            throw new CertificateVerificationException(
                    Reason.BAD_SIGNATURE,
                    "Certificate signature does not verify against the trusted root CA", e);
        }
    }

    /**
     * Step 4. A certificate is a statement with an expiry date. Checked against an
     * injected clock so tests can stand at any point in time without sleeping.
     */
    private void checkValidityPeriod(X509Certificate certificate) {
        Date now = Date.from(clock.instant());
        if (now.before(certificate.getNotBefore())) {
            throw new CertificateVerificationException(
                    Reason.NOT_YET_VALID, "Certificate is not valid until " + certificate.getNotBefore());
        }
        if (now.after(certificate.getNotAfter())) {
            throw new CertificateVerificationException(
                    Reason.EXPIRED, "Certificate expired on " + certificate.getNotAfter());
        }
    }

    /** Pulls CN=... out of a distinguished name like "CN=card-red, O=safe-auth, C=SE". */
    private static String commonNameOf(X500Principal principal) {
        for (String part : principal.getName().split(",")) {
            String trimmed = part.trim();
            if (trimmed.startsWith("CN=")) {
                return trimmed.substring(3);
            }
        }
        throw new CertificateVerificationException(
                Reason.MALFORMED_PEM, "Certificate subject has no common name");
    }
}

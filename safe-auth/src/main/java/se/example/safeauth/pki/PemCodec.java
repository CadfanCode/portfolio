package se.example.safeauth.pki;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Base64;

import se.example.safeauth.pki.CertificateVerificationException.Reason;

/**
 * Converts certificates between their binary DER form and the PEM text that travels
 * over HTTP.
 *
 * <p>PEM is not a security mechanism. It is base64 of the exact same DER bytes, wrapped
 * in header and footer lines, so that a certificate can be pasted into an email or a
 * JSON body without a binary-safe transport. Nothing here is encrypted or secret: a
 * certificate is a public document by design.
 */
public final class PemCodec {

    private static final String HEADER = "-----BEGIN CERTIFICATE-----";
    private static final String FOOTER = "-----END CERTIFICATE-----";

    /** PEM wraps base64 at 64 characters per line. */
    private static final int LINE_LENGTH = 64;

    private PemCodec() {
    }

    /** Renders a certificate as PEM text. */
    public static String toPem(X509Certificate certificate) {
        byte[] der;
        try {
            // getEncoded() returns the certificate's DER bytes: the signed structure
            // exactly as the CA produced it. Re-encoding is byte-for-byte stable, which
            // is what lets a verifier re-check the signature over it later.
            der = certificate.getEncoded();
        } catch (CertificateException e) {
            throw new IllegalStateException("Could not DER-encode a certificate we issued", e);
        }

        String base64 = Base64.getEncoder().encodeToString(der);
        StringBuilder pem = new StringBuilder(HEADER).append('\n');
        for (int i = 0; i < base64.length(); i += LINE_LENGTH) {
            pem.append(base64, i, Math.min(i + LINE_LENGTH, base64.length())).append('\n');
        }
        return pem.append(FOOTER).append('\n').toString();
    }

    /**
     * Parses PEM text back into a certificate.
     *
     * <p>Parsing proves only that the bytes are a well-formed X.509 structure. It proves
     * nothing about who signed it — anyone can generate a syntactically perfect
     * certificate. That is what {@link CertificateChainVerifier} is for.
     */
    public static X509Certificate fromPem(String pem) {
        if (pem == null || pem.isBlank()) {
            throw new CertificateVerificationException(Reason.MALFORMED_PEM, "No certificate was presented");
        }
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            byte[] bytes = pem.getBytes(StandardCharsets.US_ASCII);
            return (X509Certificate) factory.generateCertificate(new ByteArrayInputStream(bytes));
        } catch (CertificateException | ClassCastException e) {
            throw new CertificateVerificationException(
                    Reason.MALFORMED_PEM, "Presented data is not a readable X.509 certificate", e);
        }
    }
}

package se.example.safeauth.pki;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

/**
 * Issues one card certificate, signed by the root CA.
 *
 * <p>This is the moment a card becomes trustworthy. Before it, the card's key pair is
 * just two numbers nobody vouches for. After it, the CA has put its signature over the
 * statement "this public key belongs to card-red, and card-red may open safe:boat and
 * safe:key". Verification later is the act of re-checking that signature.
 */
public final class CardCertificateIssuer {

    private static final String CURVE = "secp256r1";
    private static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";

    /** Short on purpose: a demo credential should not outlive the demo by years. */
    private static final Duration LIFETIME = Duration.ofDays(365);

    private final SecureRandom random = new SecureRandom();

    /**
     * Generates a key pair for the card and signs a certificate binding it to the card's
     * id and entitlements.
     *
     * @param ca           the root authority whose private key makes the signature
     * @param cardId       becomes the certificate's common name, e.g. {@code card-red}
     * @param entitlements baked into the custom extension, and so covered by the signature
     */
    public IssuedCard issue(RootCertificateAuthority ca, String cardId, List<String> entitlements, Clock clock) {
        try {
            // 1. The card's own key pair. Same curve as the CA, for no reason other than
            //    consistency — a card's key is unrelated to its issuer's key.
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec(CURVE), random);
            KeyPair cardKeys = generator.generateKeyPair();

            Instant now = clock.instant();

            // 2. Issuer is the CA's subject name, taken as raw DER rather than via a
            //    string. RFC 5280 requires a child's issuer field to match its parent's
            //    subject field by exact binary comparison, and the round trip through
            //    X500Principal.getName() quietly breaks that: getName() emits RFC 2253,
            //    which lists the parts in the reverse of their DER order, and
            //    X500Name(String) then parses them back in the order written. The name
            //    reads identically and encodes backwards, so the chain stops verifying
            //    for a reason nothing in the error message points at.
            JcaX509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                    X500Name.getInstance(ca.certificate().getSubjectX500Principal().getEncoded()),
                    new BigInteger(128, random),
                    Date.from(now.minus(Duration.ofMinutes(5))),
                    Date.from(now.plus(LIFETIME)),
                    new X500Name("CN=" + cardId + ", O=safe-auth, C=SE"),
                    cardKeys.getPublic());

            // 3. cA=false marks this an end-entity certificate: it identifies a holder and
            //    may not issue anything further. Critical, so a verifier cannot skip it.
            builder.addExtension(Extension.basicConstraints, true, new BasicConstraints(false));

            // digitalSignature is the permission a card needs to sign a challenge, which
            // is what a real tap would involve.
            builder.addExtension(Extension.keyUsage, true, new KeyUsage(KeyUsage.digitalSignature));

            // 4. The entitlements. This is the payload the whole design hangs on: because
            //    it sits inside the signed structure, editing it invalidates the signature.
            builder.addExtension(EntitlementExtension.OID, EntitlementExtension.CRITICAL,
                    EntitlementExtension.encode(entitlements));

            // 5. Signed with the CA's private key — not the card's. A certificate signed
            //    by its own subject would be self-signed and would vouch for nothing.
            ContentSigner signer = new JcaContentSignerBuilder(SIGNATURE_ALGORITHM)
                    .build(ca.privateKey());

            X509Certificate certificate = new JcaX509CertificateConverter()
                    .getCertificate(builder.build(signer));

            return new IssuedCard(certificate, cardKeys);
        } catch (Exception e) {
            throw new IllegalStateException("Could not issue a certificate for " + cardId, e);
        }
    }
}

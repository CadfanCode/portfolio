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

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509ExtensionUtils;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

/**
 * Generates the self-signed root CA at startup.
 *
 * <p><strong>Why EC P-256 rather than RSA 2048?</strong> Three reasons, in order of how
 * much they mattered here. First, the public key is 65 bytes rather than 270, so the JWK
 * published at /.well-known/jwks.json fits on one screen and can actually be read.
 * Second, P-256 is estimated at roughly the strength of RSA 3072 while being far smaller
 * and faster to sign with. Third, ES256 is a first-class OpenID Connect signing algorithm,
 * so nothing about this choice is exotic. The trade-off: RSA/RS256 remains the more
 * common default in the wild, so most tutorials you read will show RSA.
 */
public final class RootCaGenerator {

    /** The name this CA issues under. Appears as the issuer on every card. */
    private static final String SUBJECT_DN = "CN=Safe Auth Demo Root CA, O=safe-auth, C=SE";

    private static final String CURVE = "secp256r1";
    private static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";
    private static final Duration LIFETIME = Duration.ofDays(3650);

    private final SecureRandom random = new SecureRandom();

    /**
     * Builds the key pair and the self-signed certificate that describes it.
     *
     * <p>"Self-signed" means subject and issuer are the same name, and the signature is
     * made with the very key the certificate contains. It therefore proves nothing
     * cryptographically — it cannot, there is nothing above it to vouch for it. A root CA
     * is trusted because it was installed as trusted, not because it verified.
     */
    public RootCertificateAuthority generate(Clock clock) {
        try {
            // 1. Generate the key pair. The private key will sign every card certificate
            //    and every JWT this service issues; the public key is what the world uses
            //    to check that work.
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec(CURVE), random);
            KeyPair keyPair = generator.generateKeyPair();

            Instant now = clock.instant();
            X500Name name = new X500Name(SUBJECT_DN);

            // 2. Describe the certificate. Serial numbers must be unique per issuer;
            //    a random 128-bit value is the standard way to guarantee that without
            //    keeping a counter, and it also frustrates certain collision attacks.
            JcaX509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                    name,                                   // issuer — itself
                    new BigInteger(128, random),            // serial
                    Date.from(now.minus(Duration.ofMinutes(5))), // notBefore, backdated for clock skew
                    Date.from(now.plus(LIFETIME)),          // notAfter
                    name,                                   // subject — itself
                    keyPair.getPublic());

            // 3. Extensions. BasicConstraints(cA=true) is what makes this a CA rather
            //    than an end-entity certificate, and pathLen=0 says it may issue leaf
            //    certificates but no intermediate CAs beneath it. Both are marked
            //    critical: a verifier that does not understand them must refuse, because
            //    misreading "is this a CA?" is exactly how a leaf certificate gets used
            //    to mint others.
            builder.addExtension(Extension.basicConstraints, true, new BasicConstraints(0));

            // keyCertSign is the permission to sign certificates; cRLSign the permission
            // to sign revocation lists. Note what is absent: digitalSignature. A strict
            // reading says this key should not be signing JWTs at all — see the README
            // section on why a real system uses a separate token signing key.
            builder.addExtension(Extension.keyUsage, true,
                    new KeyUsage(KeyUsage.keyCertSign | KeyUsage.cRLSign));

            // A fingerprint of the public key, so a verifier assembling a chain can find
            // this certificate quickly rather than trial-verifying every CA it knows.
            JcaX509ExtensionUtils utils = new JcaX509ExtensionUtils();
            builder.addExtension(Extension.subjectKeyIdentifier, false,
                    utils.createSubjectKeyIdentifier(keyPair.getPublic()));

            // 4. Sign. The signature covers the DER encoding of everything above: names,
            //    validity, public key and all extensions. Change one byte of any of it
            //    and verification fails.
            ContentSigner signer = new JcaContentSignerBuilder(SIGNATURE_ALGORITHM)
                    .build(keyPair.getPrivate());

            X509Certificate certificate = new JcaX509CertificateConverter()
                    .getCertificate(builder.build(signer));

            return new RootCertificateAuthority(certificate, keyPair);
        } catch (Exception e) {
            // Failing to build the trust anchor means the service has no basis for any
            // decision it exists to make. Refuse to start rather than run untrustworthy.
            throw new IllegalStateException("Could not generate the root certificate authority", e);
        }
    }
}

package se.example.safeauth.pki;

import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

import org.bouncycastle.asn1.ASN1EncodableVector;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1OctetString;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.DERSequence;
import org.bouncycastle.asn1.DERUTF8String;

import se.example.safeauth.pki.CertificateVerificationException.Reason;

/**
 * The custom X.509 extension that carries a card's entitlements.
 *
 * <p>This is the design decision that makes the demo interesting. We could keep a table
 * mapping card id to entitlements, but then the entitlement would be a fact the server
 * remembers, and the certificate would be a mere name badge. Putting the entitlements
 * <em>inside</em> the certificate means they are covered by the CA's signature: you
 * cannot grant yourself {@code safe:key} by editing the extension, because the signature
 * over the whole structure would stop verifying. The entitlement travels with the card.
 *
 * <p>The OID sits under the private-enterprise arc {@code 1.3.6.1.4.1}. A real issuer
 * would register its own enterprise number with IANA; 99999 is deliberately fake so this
 * cannot collide with anyone's production OID.
 *
 * <p>The extension is marked <strong>non-critical</strong>. Criticality is an instruction
 * to verifiers: "if you do not understand this extension, reject the certificate". Ours
 * is non-critical so that generic tooling — {@code openssl x509 -text}, a browser, a load
 * balancer — can still parse the certificate without knowing what a safe entitlement is.
 * Our own verifier requires it regardless.
 */
public final class EntitlementExtension {

    public static final ASN1ObjectIdentifier OID = new ASN1ObjectIdentifier("1.3.6.1.4.1.99999.1.1");

    /** Extensions are declared critical or not; ours is not. See the class comment. */
    public static final boolean CRITICAL = false;

    private EntitlementExtension() {
    }

    /**
     * Encodes entitlements as an ASN.1 {@code SEQUENCE OF UTF8String}.
     *
     * <p>A SEQUENCE is an ordered list; UTF8String is the modern string type for new
     * definitions. The result is handed to the certificate builder, which DER-encodes it
     * and folds it into the bytes the CA then signs.
     */
    public static DERSequence encode(List<String> entitlements) {
        ASN1EncodableVector values = new ASN1EncodableVector();
        for (String entitlement : entitlements) {
            values.add(new DERUTF8String(entitlement));
        }
        return new DERSequence(values);
    }

    /**
     * Reads the entitlements back out of a certificate.
     *
     * <p>Call this only on a certificate whose signature has already been verified.
     * Reading an extension is just parsing bytes; it tells you what the certificate
     * claims, not whether the claim is trustworthy.
     */
    public static List<String> decode(X509Certificate certificate) {
        // getExtensionValue returns the extension wrapped in an OCTET STRING — the X.509
        // structure stores every extension body as an opaque blob, so there are two
        // layers to peel: the OCTET STRING, then our SEQUENCE inside it.
        byte[] wrapped = certificate.getExtensionValue(OID.getId());
        if (wrapped == null) {
            throw new CertificateVerificationException(
                    Reason.MISSING_ENTITLEMENTS,
                    "Certificate carries no entitlement extension (" + OID.getId() + ")");
        }

        try {
            ASN1OctetString outer = ASN1OctetString.getInstance(wrapped);
            ASN1Sequence sequence = ASN1Sequence.getInstance(outer.getOctets());

            List<String> entitlements = new ArrayList<>(sequence.size());
            for (int i = 0; i < sequence.size(); i++) {
                entitlements.add(DERUTF8String.getInstance(sequence.getObjectAt(i)).getString());
            }
            return List.copyOf(entitlements);
        } catch (IllegalArgumentException e) {
            throw new CertificateVerificationException(
                    Reason.MISSING_ENTITLEMENTS, "Entitlement extension is present but malformed", e);
        }
    }
}

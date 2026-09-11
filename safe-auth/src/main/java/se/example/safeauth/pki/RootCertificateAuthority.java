package se.example.safeauth.pki;

import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.cert.X509Certificate;

/**
 * The in-memory root certificate authority: the single trust anchor for this service.
 *
 * <p>"Trust anchor" is the whole idea. This service trusts exactly one key. A card is
 * genuine if and only if its certificate carries a signature made by {@link #privateKey()},
 * verifiable with {@link #publicKey()}. Anything signed by any other CA — however
 * well-formed — is a stranger's card and is refused.
 *
 * <p>The private key exists only in this process's heap and is never written to disk. A
 * restart generates a brand-new CA, which invalidates every certificate previously
 * issued. That is a deliberate property of a throwaway demo, and a real lesson: the
 * lifetime of a trust anchor is the lifetime of everything beneath it.
 */
public record RootCertificateAuthority(X509Certificate certificate, KeyPair keyPair) {

    /** Signs card certificates and both JWTs. Never leaves this process. */
    public PrivateKey privateKey() {
        return keyPair.getPrivate();
    }

    /** Verifies card certificates and both JWTs. Published at /.well-known/jwks.json. */
    public PublicKey publicKey() {
        return keyPair.getPublic();
    }
}

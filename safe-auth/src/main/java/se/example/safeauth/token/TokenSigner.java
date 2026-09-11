package se.example.safeauth.token;

import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import se.example.safeauth.pki.RootCertificateAuthority;

/**
 * The single place a signature is produced.
 *
 * <p>Signs with the root CA's private key, which is what visibly ties the PKI half of
 * this project to the OIDC half: the same key that vouches for a card also vouches for
 * the tokens issued after that card is tapped. The README explains at length why a real
 * system would not do this — in short, a CA key is a long-lived offline trust anchor
 * whose compromise invalidates every certificate ever issued, while a token signing key
 * is a hot, frequently rotated key on an internet-facing box.
 *
 * <p>The {@code kid} is an RFC 7638 thumbprint of the public key: a stable fingerprint
 * that lets a client pick the right key out of the JWK set without guessing.
 */
public final class TokenSigner {

    private static final JWSAlgorithm ALGORITHM = JWSAlgorithm.ES256;

    private final ECDSASigner signer;
    private final String keyId;

    public TokenSigner(RootCertificateAuthority ca) {
        try {
            this.signer = new ECDSASigner((ECPrivateKey) ca.privateKey());
            this.keyId = new ECKey.Builder(Curve.P_256, (ECPublicKey) ca.publicKey())
                    .build()
                    .computeThumbprint()
                    .toString();
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not build a signer from the root CA key", e);
        }
    }

    public String keyId() {
        return keyId;
    }

    /**
     * Signs a claims set into a compact JWT.
     *
     * <p>The header names the algorithm and key id; the payload is the claims. The
     * signature covers the base64url encoding of both, joined by a dot — so altering any
     * claim after the fact invalidates it. Note that a JWT is signed, not encrypted:
     * anyone can read these claims. Never put a secret in one.
     */
    public String sign(JWTClaimsSet claims) {
        JWSHeader header = new JWSHeader.Builder(ALGORITHM).keyID(keyId).build();
        SignedJWT jwt = new SignedJWT(header, claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign a token", e);
        }
        return jwt.serialize();
    }
}

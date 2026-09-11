package se.example.safeauth.token;

import java.security.interfaces.ECPublicKey;
import java.util.Map;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;

import se.example.safeauth.pki.RootCertificateAuthority;

/**
 * Publishes the public signing key as a JWK set.
 *
 * <p>This endpoint is how token verification scales without shared secrets. A client that
 * wants to check one of our tokens fetches this document, matches the token header's
 * {@code kid} to a key here, and verifies locally — no call back to us, no secret ever
 * distributed. Publishing it is safe precisely because a public key can only check
 * signatures, never make them.
 */
public final class JwkSetProvider {

    private final JWKSet jwkSet;

    public JwkSetProvider(RootCertificateAuthority ca, TokenSigner signer) {
        ECKey key = new ECKey.Builder(Curve.P_256, (ECPublicKey) ca.publicKey())
                .keyID(signer.keyId())
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.ES256)
                .build();

        // toPublicJWK() strips any private component. This key was built from the public
        // half only, so there is nothing to strip — the call is here because publishing
        // a JWK set is exactly the place where forgetting it leaks a signing key.
        this.jwkSet = new JWKSet(key.toPublicJWK());
    }

    /** The document served at /.well-known/jwks.json. */
    public Map<String, Object> asJson() {
        return jwkSet.toJSONObject();
    }
}

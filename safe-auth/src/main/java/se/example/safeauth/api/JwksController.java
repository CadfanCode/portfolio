package se.example.safeauth.api;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import se.example.safeauth.token.JwkSetProvider;

/**
 * Publishes the public signing key.
 *
 * <p>Unauthenticated, and right to be. This document is how a third party verifies one of
 * our tokens without ever calling us: fetch the key set, match the token header's
 * {@code kid}, check the signature locally. A public key can only check signatures, never
 * produce them, so there is nothing here to guard — the mistake worth avoiding is at the
 * other end, in {@code JwkSetProvider}, where forgetting {@code toPublicJWK()} would
 * publish a private key to exactly this URL.
 *
 * <p>The {@code /.well-known/} prefix is reserved by RFC 8615 for documents a client
 * should be able to find without being told where they are. The {@code jwks.json} name
 * under it is convention; a full OpenID Connect deployment advertises the real URL as
 * {@code jwks_uri} in its discovery document.
 */
@RestController
public class JwksController {

    private final JwkSetProvider jwkSet;

    public JwksController(JwkSetProvider jwkSet) {
        this.jwkSet = jwkSet;
    }

    @GetMapping("/.well-known/jwks.json")
    public Map<String, Object> jwks() {
        return jwkSet.asJson();
    }
}

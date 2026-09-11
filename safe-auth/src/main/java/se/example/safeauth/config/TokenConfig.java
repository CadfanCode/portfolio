package se.example.safeauth.config;

import java.time.Clock;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import se.example.safeauth.pki.RootCertificateAuthority;
import se.example.safeauth.token.AccessTokenIssuer;
import se.example.safeauth.token.IdTokenIssuer;
import se.example.safeauth.token.JwkSetProvider;
import se.example.safeauth.token.ScopeGuard;
import se.example.safeauth.token.TokenSettings;
import se.example.safeauth.token.TokenSigner;
import se.example.safeauth.token.TokenValidator;

/**
 * Wires the token half of the service: one signer, two issuers, one validator.
 *
 * <p>Every one of these beans takes the same {@link RootCertificateAuthority}, which is
 * the join between the two halves of the project — the key that vouches for a card also
 * signs the tokens issued once that card is tapped. A real system separates them, for the
 * reason spelled out in {@code TokenSigner}: a CA key is a long-lived offline anchor and
 * a token signing key is a hot one that rotates.
 *
 * <p>Issuer, audience and both lifetimes come from application.yaml, with the defaults
 * below as a fallback so the service still starts with no configuration at all. Deploy it
 * somewhere real and the issuer must be changed to that public URL — a token whose
 * {@code iss} does not match the service that minted it is exactly what the issuer check
 * on the other end exists to catch.
 */
@Configuration
public class TokenConfig {

    @Bean
    public TokenSettings tokenSettings(
            @Value("${safe-auth.issuer:http://localhost:8080}") String issuer,
            @Value("${safe-auth.audience:safe-auth-demo}") String audience,
            @Value("${safe-auth.id-token-lifetime-minutes:10}") long idTokenMinutes,
            @Value("${safe-auth.access-token-lifetime-minutes:5}") long accessTokenMinutes) {

        return new TokenSettings(
                issuer,
                audience,
                Duration.ofMinutes(idTokenMinutes),
                Duration.ofMinutes(accessTokenMinutes));
    }

    @Bean
    public TokenSigner tokenSigner(RootCertificateAuthority ca) {
        return new TokenSigner(ca);
    }

    @Bean
    public IdTokenIssuer idTokenIssuer(TokenSigner signer, TokenSettings settings, Clock clock) {
        return new IdTokenIssuer(signer, settings, clock);
    }

    @Bean
    public AccessTokenIssuer accessTokenIssuer(TokenSigner signer, TokenSettings settings, Clock clock) {
        return new AccessTokenIssuer(signer, settings, clock);
    }

    /**
     * Validation reads the public half of the same key. It is written out by hand rather
     * than handed to a framework, which is the whole point of the project — the order of
     * the checks inside it is the thing worth reading.
     */
    @Bean
    public TokenValidator tokenValidator(RootCertificateAuthority ca, TokenSettings settings, Clock clock) {
        return new TokenValidator(ca, settings, clock);
    }

    @Bean
    public ScopeGuard scopeGuard() {
        return new ScopeGuard();
    }

    @Bean
    public JwkSetProvider jwkSetProvider(RootCertificateAuthority ca, TokenSigner signer) {
        return new JwkSetProvider(ca, signer);
    }
}

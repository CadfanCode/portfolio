package se.example.safeauth.pki;

import java.security.cert.X509Certificate;
import java.util.List;

/**
 * The result of a successful verification: a certificate we are now willing to act on,
 * with the facts we extracted from it.
 *
 * <p>Its existence is the proof. {@link CertificateChainVerifier} is the only thing that
 * can construct one, and it does so only after every check has passed — so any code
 * holding a VerifiedCard can rely on the card being genuine without re-checking.
 *
 * @param cardId       the subject common name, e.g. {@code card-red}
 * @param entitlements read from the signed custom extension
 * @param serialHex    the certificate serial in hex; used as the OIDC {@code sub} claim
 */
public record VerifiedCard(String cardId, List<String> entitlements, String serialHex, X509Certificate certificate) {
}

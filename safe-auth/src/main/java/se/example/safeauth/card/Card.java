package se.example.safeauth.card;

import java.security.cert.X509Certificate;
import java.util.List;

/**
 * One demo keycard: the object a visitor picks up off the table.
 *
 * <p>Deliberately contains no secret. The certificate is public by design, and the
 * passcode lives elsewhere as a hash ({@link PasscodeVault}), so a Card can be handed to
 * the API layer without anything needing to be stripped out first.
 *
 * <p>The entitlements here are a convenience copy of what is inside the certificate's
 * custom extension. The copy is never the authority — every request re-reads them from
 * the signed certificate, because only those are covered by the CA's signature.
 */
public record Card(String id, String displayName, X509Certificate certificate, List<String> entitlements) {
}

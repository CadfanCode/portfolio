package se.example.safeauth.config;

import java.time.Clock;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import se.example.safeauth.card.Card;
import se.example.safeauth.card.CardRegistry;
import se.example.safeauth.card.EntitlementCatalog;
import se.example.safeauth.card.PasscodeHasher;
import se.example.safeauth.card.PasscodeVault;
import se.example.safeauth.card.StoredPasscode;
import se.example.safeauth.pki.CardCertificateIssuer;
import se.example.safeauth.pki.IssuedCard;
import se.example.safeauth.pki.RootCertificateAuthority;

/**
 * Produces the two demo cards at startup, from the CA that was just generated.
 *
 * <p>This is the card factory standing next to the CA, which is exactly the arrangement a
 * real deployment does not have — there, a card generates its key pair inside its own
 * chip and only a signing request travels. Here the two live in one process, so each card
 * is issued, its certificate kept, and its private key dropped on the floor: nothing in
 * the current tap flow needs it, and holding a key nobody uses is a liability.
 *
 * <p><strong>The two passcodes below are the only hard-coded secrets in the project, and
 * neither is ever stored as typed.</strong> Each goes straight through
 * {@link PasscodeHasher#hash(String)}, which salts it and runs 210,000 PBKDF2 iterations,
 * and only that result reaches {@link PasscodeVault}. They are visible here because the
 * front end has to print them on the card for a visitor to type; that is a property of a
 * demo, not a pattern to copy. What is worth copying is that even a passcode written in
 * the source is hashed before it is kept, so nothing downstream — a log line, a heap
 * dump, a serialised bean — can ever hand one back.
 */
@Configuration
public class CardConfig {

    private static final String BLUE_ID = "card-blue";
    private static final String BLUE_NAME = "Blue Crew Card";
    private static final String BLUE_PASSCODE = "1977";

    private static final String RED_ID = "card-red";
    private static final String RED_NAME = "Red Skipper Card";
    private static final String RED_PASSCODE = "7731";

    @Bean
    public PasscodeHasher passcodeHasher() {
        return new PasscodeHasher();
    }

    @Bean
    public EntitlementCatalog entitlementCatalog() {
        return new EntitlementCatalog();
    }

    /**
     * Blue opens the safe; red opens the safe and the key inside it. The entitlements
     * given here are baked into each certificate's signed extension, so these two lists
     * are the authority for what each card can do — nothing re-states them at request
     * time, it is all read back out of the signature.
     */
    @Bean
    public CardRegistry cardRegistry(RootCertificateAuthority ca, CardCertificateIssuer issuer, Clock clock) {
        return new CardRegistry(List.of(
                issue(ca, issuer, clock, BLUE_ID, BLUE_NAME,
                        List.of(EntitlementCatalog.SCOPE_BOAT)),
                issue(ca, issuer, clock, RED_ID, RED_NAME,
                        List.of(EntitlementCatalog.SCOPE_BOAT, EntitlementCatalog.SCOPE_KEY))));
    }

    /**
     * The hashes, keyed by card id. Kept in its own bean rather than on {@link Card} so
     * that nothing which is rendered into JSON has a field holding a hash at all.
     */
    @Bean
    public PasscodeVault passcodeVault(PasscodeHasher hasher) {
        Map<String, StoredPasscode> passcodes = Map.of(
                BLUE_ID, hasher.hash(BLUE_PASSCODE),
                RED_ID, hasher.hash(RED_PASSCODE));
        return new PasscodeVault(passcodes, hasher);
    }

    private static Card issue(RootCertificateAuthority ca, CardCertificateIssuer issuer, Clock clock,
                              String id, String displayName, List<String> entitlements) {
        IssuedCard issued = issuer.issue(ca, id, entitlements, clock);
        // Only the certificate is kept. issued.keyPair() holds the card's private key,
        // which this flow never uses — see IssuedCard for where it would plug in.
        return new Card(id, displayName, issued.certificate(), entitlements);
    }
}

package se.example.safeauth.api.dto;

/**
 * A card as the front end is allowed to see it: an id, and a label to print on it.
 *
 * <p>The {@code Card} this is built from also carries a certificate and a list of
 * entitlements. Neither is secret — but neither belongs in a list view either. Shipping
 * the entitlements here would invite a front end to decide what the safe contains, and
 * that decision is the server's. Send what the caller needs and nothing beside it.
 */
public record CardSummary(String id, String displayName) {
}

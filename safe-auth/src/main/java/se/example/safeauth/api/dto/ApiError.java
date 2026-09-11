package se.example.safeauth.api.dto;

/**
 * The single shape every failure takes.
 *
 * <p>{@code error} is a short stable code a client can branch on — {@code invalid_card},
 * {@code invalid_token}, {@code insufficient_scope}, {@code unknown_card}. {@code message}
 * is a sentence for whoever is reading the response.
 *
 * <p>Neither ever carries a stack trace, an exception class name, a file path or a
 * library version. An error body is the cheapest reconnaissance an attacker can run, and
 * a default framework error page hands over the class hierarchy for free.
 */
public record ApiError(String error, String message) {
}

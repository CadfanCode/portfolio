package se.example.safeauth.api.dto;

/**
 * What a successful tap returns: both tokens, and how long the access token is good for.
 *
 * <p>{@code expiresIn} is a number of seconds rather than a timestamp, which is how OAuth 2
 * defines it. A duration needs no agreement about clocks between the two machines; an
 * absolute expiry time is only as useful as the client's idea of "now".
 *
 * <p>A standards-compliant token endpoint would render these as {@code id_token},
 * {@code access_token} and {@code expires_in}. This one serves its own front end, so the
 * fields keep Java naming and Jackson emits them as-is.
 */
public record TapResponse(String idToken, String accessToken, long expiresIn) {
}

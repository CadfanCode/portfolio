package se.example.safeauth.api.dto;

/**
 * The body of a tap: the certificate being presented, and the passcode typed under it.
 *
 * <p>The PEM travels as ordinary text because a certificate is a public document; there
 * is nothing in it to hide. The passcode is the only secret in the exchange, and it is
 * the reason this is a POST. A GET would carry it in the URL, and from there it would
 * land in the browser history, the proxy log and the access log of every hop.
 */
public record TapRequest(String certificatePem, String passcode) {
}

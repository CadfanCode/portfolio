package se.example.safeauth.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import se.example.safeauth.api.dto.ApiError;
import se.example.safeauth.pki.CertificateVerificationException;
import se.example.safeauth.token.TokenValidationException;
import se.example.safeauth.token.TokenValidationException.Reason;

/**
 * Turns the exceptions thrown down in pki/ and token/ into HTTP responses, in one place.
 *
 * <p>Two rules hold across all of it.
 *
 * <p><strong>The status comes from the exception's own reason code</strong>, never from
 * inspecting a message. Both exception types carry an enum precisely so this class can
 * switch on a value the thrower chose deliberately. String-matching an error message is
 * how a renamed sentence silently downgrades a 403 into a 500 a year later.
 *
 * <p><strong>The body is our sentence and nothing else.</strong> No stack trace, no
 * exception class name, no cause chain, no SQL, no paths. Everything that reaches a
 * client here was written as prose by the code that threw it.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /**
     * A card that failed any step of verification — malformed, issued by an untrusted CA,
     * bad signature, outside its validity window, or carrying no entitlements.
     *
     * <p>All of them are 401: a card we cannot verify is a card we do not know, and we
     * fail closed. The code is always {@code invalid_card}, while the message does name
     * which check failed. That is a deliberate trade for a project meant to be read —
     * a production endpoint would more often return one opaque sentence, so that a
     * forger cannot use the error text to work out how close they got.
     */
    @ExceptionHandler(CertificateVerificationException.class)
    public ResponseEntity<ApiError> onCertificateVerification(CertificateVerificationException e) {
        return respond(HttpStatus.UNAUTHORIZED, new ApiError("invalid_card", e.getMessage()));
    }

    /**
     * A wrong or missing passcode. Same 401 and the same {@code invalid_card} code as a
     * bad certificate, so the response does not tell a caller which of the two halves of
     * the tap they got right.
     */
    @ExceptionHandler(InvalidPasscodeException.class)
    public ResponseEntity<ApiError> onInvalidPasscode(InvalidPasscodeException e) {
        return respond(HttpStatus.UNAUTHORIZED, new ApiError("invalid_card", e.getMessage()));
    }

    /**
     * A bearer token problem. The reason decides both halves of the answer.
     *
     * <p>401 with {@code invalid_token} means "I do not believe this token" — it was
     * absent, malformed, expired, or signed by someone else. 403 with
     * {@code insufficient_scope} means "I believe it, and it still does not let you do
     * that". Both codes are the ones RFC 6750 defines, so a client written against the
     * spec already knows them. Conflating the two is the common bug: a 401 tells the
     * client to go and authenticate again, which for a missing scope achieves nothing.
     */
    @ExceptionHandler(TokenValidationException.class)
    public ResponseEntity<ApiError> onTokenValidation(TokenValidationException e) {
        Reason reason = e.reason();
        String code = reason == Reason.INSUFFICIENT_SCOPE ? "insufficient_scope" : "invalid_token";
        return respond(HttpStatus.valueOf(reason.status()), new ApiError(code, e.getMessage()));
    }

    /** A path naming a card that does not exist. Nothing was refused, so 404, not 401. */
    @ExceptionHandler(UnknownCardException.class)
    public ResponseEntity<ApiError> onUnknownCard(UnknownCardException e) {
        return respond(HttpStatus.NOT_FOUND, new ApiError("unknown_card", e.getMessage()));
    }

    private static ResponseEntity<ApiError> respond(HttpStatus status, ApiError body) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(status);

        // RFC 6750 requires a 401 from a protected resource to carry WWW-Authenticate
        // naming the scheme the client should use. It is what tells a client that
        // retrying with a token is worth doing at all — a 401 without it is, strictly,
        // a malformed response, and browsers and HTTP libraries do act on the header.
        // A fuller version may add error="invalid_token" and a realm; the bare scheme is
        // the minimum, and the error code is already in the body below.
        if (status == HttpStatus.UNAUTHORIZED) {
            response.header(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        }

        return response.body(body);
    }
}

package se.example.safeauth.api;

import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import se.example.safeauth.api.dto.SafeContents;
import se.example.safeauth.card.EntitlementCatalog;
import se.example.safeauth.token.ScopeGuard;
import se.example.safeauth.token.TokenValidator;
import se.example.safeauth.token.ValidatedToken;

/**
 * The protected resource. Everything else in this service exists so that this endpoint
 * can answer one question: may you look inside, and how much of it do you get to see?
 *
 * <p>Those are two decisions, taken in order, and keeping them apart is the point.
 * {@code safe:boat} is what opens the safe at all — a token without it gets a 403, not an
 * empty list, because "you may not look" and "there is nothing in here" are different
 * statements and a client should not have to guess which one it received.
 *
 * <p>Once the safe is open, the contents are filtered by the scopes the token actually
 * carries, so card-blue sees {@code ["boat"]} and card-red sees {@code ["boat", "key"]}.
 * Note where that filtering happens: here, on the server, before the response is built.
 * Sending both items and letting the front end hide one would look identical in a browser
 * and protect nothing.
 */
@RestController
public class SafeController {

    private final TokenValidator validator;
    private final ScopeGuard scopeGuard;
    private final EntitlementCatalog catalog;

    public SafeController(TokenValidator validator, ScopeGuard scopeGuard, EntitlementCatalog catalog) {
        this.validator = validator;
        this.scopeGuard = scopeGuard;
        this.catalog = catalog;
    }

    /**
     * @param authorization declared {@code required = false} on purpose: a missing header
     *                      should reach our own code and come back as a 401 with a body
     *                      explaining itself, not be turned into a bare 400 by Spring
     *                      before the request ever arrives here.
     */
    @GetMapping("/api/safe")
    public SafeContents open(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {

        // 1. Get the raw token out of the header. Absent, wrong scheme or empty all throw.
        String rawToken = BearerTokenExtractor.bearerToken(authorization);

        // 2. Is the token real? Signature, expiry, issuer, audience — all inside validate(),
        //    all failing with a 401 reason. Nothing below sees an unverified claim.
        ValidatedToken token = validator.validate(rawToken);

        // 3. Does it permit this? A separate question with a separate status: 403, because
        //    the token is fine and re-authenticating with the same card would change
        //    nothing. Answering 401 here would send the client round a pointless loop.
        scopeGuard.require(token, EntitlementCatalog.SCOPE_BOAT);

        // 4. Filter the contents by what this token was granted, not by what exists.
        return new SafeContents(catalog.itemsFor(token.scopes()));
    }
}

package se.example.safeauth.api;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import se.example.safeauth.api.dto.CardSummary;
import se.example.safeauth.card.Card;
import se.example.safeauth.card.CardRegistry;
import se.example.safeauth.pki.PemCodec;

/**
 * Serves the card table: which cards exist, and the certificate each one presents.
 *
 * <p>Both endpoints are unauthenticated, and both can afford to be. The list carries no
 * secret, and a certificate is a public document — handing one out is not handing out a
 * credential, because a tap also needs the passcode, which lives only as a PBKDF2 hash.
 * Treating a certificate as though it were secret is a common instinct and a misleading
 * one; it is meant to be published, that is what makes the signature on it useful.
 *
 * <p>GET /api/cards is also what the front end pings on load to warm a sleeping backend.
 * A free-tier host parks an idle container, and without a wake-up call the visitor's
 * first real request — the tap — would be the one paying the cold start. This endpoint is
 * the cheapest thing here and touches nothing.
 */
@RestController
@RequestMapping("/api/cards")
public class CardController {

    private final CardRegistry registry;

    public CardController(CardRegistry registry) {
        this.registry = registry;
    }

    /** Every card, narrowed to id and display name. */
    @GetMapping
    public List<CardSummary> list() {
        return registry.all().stream()
                .map(card -> new CardSummary(card.id(), card.displayName()))
                .toList();
    }

    /**
     * One card's certificate as PEM text, ready to be posted straight back to /api/tap.
     *
     * <p>The content type is set on the response rather than declared with
     * {@code @GetMapping(produces = ...)}. Pinning the mapping to text/plain would also
     * constrain the error path, and the 404 below needs to answer in JSON like every
     * other failure.
     */
    @GetMapping("/{id}/certificate")
    public ResponseEntity<String> certificate(@PathVariable String id) {
        Card card = registry.byId(id).orElseThrow(() -> new UnknownCardException(id));
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_PLAIN)
                .body(PemCodec.toPem(card.certificate()));
    }
}

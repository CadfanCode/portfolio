package se.example.safeauth.card;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The two demo cards, fixed at startup.
 *
 * <p>A real system would look cards up in a directory. Here there are exactly two and
 * they are built in memory when the CA is, so this is an immutable map rather than a
 * repository. Insertion order is preserved so /api/cards renders blue before red.
 */
public final class CardRegistry {

    private final Map<String, Card> cards = new LinkedHashMap<>();

    public CardRegistry(List<Card> cards) {
        for (Card card : cards) {
            this.cards.put(card.id(), card);
        }
    }

    /** Every card, in registration order. Used by GET /api/cards. */
    public List<Card> all() {
        return List.copyOf(cards.values());
    }

    /** Looks a card up by id; empty if no such card. */
    public Optional<Card> byId(String id) {
        return Optional.ofNullable(cards.get(id));
    }
}

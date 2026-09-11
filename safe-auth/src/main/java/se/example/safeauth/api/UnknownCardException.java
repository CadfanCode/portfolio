package se.example.safeauth.api;

/**
 * Thrown when a path names a card that is not in the registry.
 *
 * <p>A 404, not a 401. The caller is not being refused anything — they asked for a thing
 * that does not exist. Giving it its own type means the exception handler reads a status
 * off the exception rather than guessing one by matching on a message, which is the
 * pattern that quietly turns every unrecognised failure into a 500 later on.
 */
public class UnknownCardException extends RuntimeException {

    public UnknownCardException(String cardId) {
        super("No card is registered with the id " + cardId);
    }
}

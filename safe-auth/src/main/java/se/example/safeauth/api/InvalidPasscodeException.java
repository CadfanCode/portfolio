package se.example.safeauth.api;

/**
 * Thrown when the passcode under a tap is missing or wrong.
 *
 * <p>The message is deliberately vague and carries no card id. A caller who has cleared
 * the certificate check and failed the passcode learns only that the pair was not
 * accepted — not which half failed, and not whether that card id exists. The distinction
 * is worth little here because /api/cards lists the ids publicly, but it is the habit to
 * keep: on a login form, telling the two apart is how account enumeration starts.
 *
 * <p>This is an authentication failure, so it becomes a 401 with the same
 * {@code invalid_card} body a bad certificate produces.
 */
public class InvalidPasscodeException extends RuntimeException {

    public InvalidPasscodeException() {
        super("Card and passcode were not accepted");
    }
}

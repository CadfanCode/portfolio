package se.example.safeauth.card;

import java.util.Map;

/**
 * Holds each card's stored passcode hash and answers the one question worth asking:
 * does this passcode unlock this card?
 *
 * <p>Separate from {@link CardRegistry} on purpose. The registry is handed to the API
 * layer and rendered into JSON; the vault is not, so there is no path by which a hash can
 * be serialised into a response by accident.
 *
 * <p>In the physical metaphor the passcode unlocks the card's private key, and the card
 * then proves itself. Here the passcode is checked server-side instead — see the README
 * on proof of possession for what that shortcut costs.
 */
public final class PasscodeVault {

    private final Map<String, StoredPasscode> passcodesByCardId;
    private final PasscodeHasher hasher;

    public PasscodeVault(Map<String, StoredPasscode> passcodesByCardId, PasscodeHasher hasher) {
        this.passcodesByCardId = Map.copyOf(passcodesByCardId);
        this.hasher = hasher;
    }

    /**
     * True only if the card exists and the passcode matches.
     *
     * <p>An unknown card id returns false rather than throwing, so a caller cannot tell
     * "no such card" apart from "wrong passcode" by the shape of the failure. That
     * distinction is worth nothing here — /api/cards lists the ids publicly — but it is
     * the habit to keep, because on a login form it is how account enumeration starts.
     */
    public boolean verify(String cardId, String passcode) {
        StoredPasscode stored = passcodesByCardId.get(cardId);
        if (stored == null) {
            return false;
        }
        return hasher.matches(passcode, stored);
    }
}

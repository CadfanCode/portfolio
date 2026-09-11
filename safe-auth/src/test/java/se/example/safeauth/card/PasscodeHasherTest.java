package se.example.safeauth.card;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasscodeHasherTest {

    private final PasscodeHasher hasher = new PasscodeHasher();

    @Test
    void accepts_the_right_passcode_and_refuses_everything_else() {
        StoredPasscode stored = hasher.hash("1977");

        assertThat(hasher.matches("1977", stored)).isTrue();
        assertThat(hasher.matches("1978", stored)).isFalse();
        assertThat(hasher.matches("", stored)).isFalse();
        assertThat(hasher.matches(null, stored)).isFalse();
    }

    @Test
    void never_stores_the_passcode_itself() {
        StoredPasscode stored = hasher.hash("1977");

        // The derived key must not contain the input. Trivially true for PBKDF2, but
        // worth asserting: this is the property the whole class exists to provide.
        assertThat(new String(stored.hash())).doesNotContain("1977");
        assertThat(stored.hash()).hasSize(32);
        assertThat(stored.salt()).hasSize(16);
    }

    @Test
    void two_cards_sharing_a_passcode_get_different_hashes() {
        StoredPasscode blue = hasher.hash("1977");
        StoredPasscode red = hasher.hash("1977");

        // This is what the salt buys. Without it, identical passcodes produce identical
        // hashes, and cracking one entry cracks every account that shares it.
        assertThat(blue.salt()).isNotEqualTo(red.salt());
        assertThat(blue.hash()).isNotEqualTo(red.hash());

        // Both still verify, because each carries the salt it was derived under.
        assertThat(hasher.matches("1977", blue)).isTrue();
        assertThat(hasher.matches("1977", red)).isTrue();
    }

    @Test
    void vault_refuses_an_unknown_card_without_distinguishing_it_from_a_wrong_passcode() {
        PasscodeVault vault = new PasscodeVault(java.util.Map.of("card-blue", hasher.hash("1977")), hasher);

        assertThat(vault.verify("card-blue", "1977")).isTrue();
        assertThat(vault.verify("card-blue", "0000")).isFalse();
        assertThat(vault.verify("card-green", "1977")).isFalse();
    }
}

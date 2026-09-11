package se.example.safeauth.card;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EntitlementCatalogTest {

    private final EntitlementCatalog catalog = new EntitlementCatalog();

    @Test
    void maps_scopes_to_the_things_they_unlock() {
        assertThat(catalog.itemsFor(List.of("safe:boat"))).containsExactly("boat");
        assertThat(catalog.itemsFor(List.of("safe:boat", "safe:key"))).containsExactly("boat", "key");
    }

    @Test
    void grants_nothing_for_no_scopes_and_ignores_scopes_it_does_not_know() {
        assertThat(catalog.itemsFor(List.of())).isEmpty();

        // An unrecognised scope matches nothing rather than falling through to a default.
        // Enumerating the permitted set means an unknown value can only ever grant less.
        assertThat(catalog.itemsFor(List.of("safe:gold", "admin"))).isEmpty();
        assertThat(catalog.itemsFor(List.of("safe:key", "safe:gold"))).containsExactly("key");
    }
}

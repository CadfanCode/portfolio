package se.example.safeauth.card;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Maps an entitlement to the thing it unlocks.
 *
 * <p>This is the only place that knows what is physically in the safe. Keeping it apart
 * from the token layer means scopes stay abstract strings everywhere else: the validator
 * checks that {@code safe:key} is present without needing to know a key exists.
 *
 * <p>Note the direction of the filter in {@link #itemsFor}. We start from what the caller
 * was granted and ask what that unlocks, rather than starting from the safe's contents
 * and asking what to hide. Enumerate what is permitted, never what is forbidden — the
 * failure mode of the first is showing too little, of the second, showing too much.
 */
public final class EntitlementCatalog {

    public static final String SCOPE_BOAT = "safe:boat";
    public static final String SCOPE_KEY = "safe:key";

    private static final Map<String, String> ITEMS_BY_SCOPE = Map.of(
            SCOPE_BOAT, "boat",
            SCOPE_KEY, "key");

    /** The safe's contents as seen by a holder of exactly these scopes. */
    public List<String> itemsFor(List<String> scopes) {
        List<String> items = new ArrayList<>();
        // Iterate the catalog rather than the caller's scopes so the output order is
        // stable and an unknown scope simply matches nothing.
        for (Map.Entry<String, String> entry : ITEMS_BY_SCOPE.entrySet()) {
            if (scopes.contains(entry.getKey())) {
                items.add(entry.getValue());
            }
        }
        items.sort(String::compareTo);
        return List.copyOf(items);
    }
}

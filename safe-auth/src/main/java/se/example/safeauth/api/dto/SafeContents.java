package se.example.safeauth.api.dto;

import java.util.List;

/**
 * What the safe holds, as seen by the holder of one particular token.
 *
 * <p>A filtered view, not an inventory. A card carrying only {@code safe:boat} gets a
 * one-item list and never learns that a key exists. The filtering happens server-side in
 * {@code EntitlementCatalog}: a response that shipped everything and let the front end
 * hide the rows it should not show would be a demonstration of nothing at all.
 */
public record SafeContents(List<String> items) {
}

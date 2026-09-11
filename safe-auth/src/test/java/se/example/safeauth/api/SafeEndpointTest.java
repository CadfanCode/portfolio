package se.example.safeauth.api;

import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import se.example.safeauth.pki.CertificateChainVerifier;
import se.example.safeauth.token.AccessTokenIssuer;
import se.example.safeauth.token.TokenSettings;
import se.example.safeauth.token.TokenSigner;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end tests for the protected resource.
 *
 * <p>Each test taps a real card through the real endpoint and uses the token that comes
 * back, so these exercise the whole chain — certificate verification, passcode, token
 * issuing, token validation, scope enforcement — rather than a hand-built token.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SafeEndpointTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private Clock clock;
    @Autowired private TokenSigner signer;
    @Autowired private TokenSettings settings;
    @Autowired private CertificateChainVerifier verifier;

    /** Taps a card the way the front end would, and returns the access token. */
    private String accessTokenFor(String cardId, String passcode) throws Exception {
        String pem = mvc.perform(get("/api/cards/{id}/certificate", cardId))
                .andReturn().getResponse().getContentAsString();

        String body = json.writeValueAsString(
                java.util.Map.of("certificatePem", pem, "passcode", passcode));

        String response = mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        return json.readTree(response).get("accessToken").asText();
    }

    /** REQUIRED TEST 3: card-blue can see the boat but not the key. */
    @Test
    void blue_card_sees_the_boat_and_never_learns_the_key_exists() throws Exception {
        mvc.perform(get("/api/safe")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessTokenFor("card-blue", "1977")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0]").value("boat"));
    }

    /** REQUIRED TEST 4: card-red can see both. */
    @Test
    void red_card_sees_both() throws Exception {
        mvc.perform(get("/api/safe")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessTokenFor("card-red", "7731")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0]").value("boat"))
                .andExpect(jsonPath("$.items[1]").value("key"));
    }

    /** REQUIRED TEST 5: an expired access token returns 401. */
    @Test
    void an_expired_access_token_is_refused() throws Exception {
        // Mint a token from an hour ago, using the service's own signer and settings, so
        // it is genuine in every respect except that its five-minute life is long over.
        // No sleeping: the issuer simply works from a clock set in the past.
        Clock anHourAgo = Clock.fixed(clock.instant().minus(Duration.ofHours(1)), ZoneOffset.UTC);

        String pem = mvc.perform(get("/api/cards/card-red/certificate"))
                .andReturn().getResponse().getContentAsString();

        String stale = new AccessTokenIssuer(signer, settings, anHourAgo).issue(verifier.verify(pem));

        mvc.perform(get("/api/safe").header(HttpHeaders.AUTHORIZATION, "Bearer " + stale))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_token"))
                .andExpect(jsonPath("$.items").doesNotExist());
    }

    @Test
    void no_token_at_all_is_a_401_with_a_challenge_header() throws Exception {
        mvc.perform(get("/api/safe"))
                .andExpect(status().isUnauthorized())
                // RFC 6750: a 401 from a bearer-protected resource must say how to
                // authenticate, or a compliant client has nothing to act on.
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string(HttpHeaders.WWW_AUTHENTICATE, org.hamcrest.Matchers.containsString("Bearer")));
    }

    @Test
    void a_token_in_the_wrong_scheme_is_a_401() throws Exception {
        String token = accessTokenFor("card-red", "7731");

        mvc.perform(get("/api/safe").header(HttpHeaders.AUTHORIZATION, "Basic " + token))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/safe").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void a_tampered_token_is_a_401() throws Exception {
        String token = accessTokenFor("card-blue", "1977");

        // Rewrite the payload to grant both scopes, leaving header and signature alone.
        String[] parts = token.split("\\.");
        JsonNode payload = json.readTree(java.util.Base64.getUrlDecoder().decode(parts[1]));
        ((com.fasterxml.jackson.databind.node.ObjectNode) payload).put("scope", "safe:boat safe:key");
        String forged = parts[0] + "."
                + java.util.Base64.getUrlEncoder().withoutPadding()
                        .encodeToString(json.writeValueAsBytes(payload))
                + "." + parts[2];

        mvc.perform(get("/api/safe").header(HttpHeaders.AUTHORIZATION, "Bearer " + forged))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_token"));
    }

    @Test
    void an_id_token_is_not_an_access_token() throws Exception {
        String pem = mvc.perform(get("/api/cards/card-red/certificate"))
                .andReturn().getResponse().getContentAsString();
        String body = json.writeValueAsString(java.util.Map.of("certificatePem", pem, "passcode", "7731"));
        String response = mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getContentAsString();

        String idToken = json.readTree(response).get("idToken").asText();

        // Genuine, correctly signed, in date, right issuer and audience — and useless
        // here, because an ID token says who you are and carries no scopes. 403, not 401:
        // the token is believed, it simply does not authorise this.
        mvc.perform(get("/api/safe").header(HttpHeaders.AUTHORIZATION, "Bearer " + idToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("insufficient_scope"));
    }
}

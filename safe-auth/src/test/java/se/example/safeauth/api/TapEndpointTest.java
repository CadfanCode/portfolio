package se.example.safeauth.api;

import java.time.Clock;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import se.example.safeauth.pki.CardCertificateIssuer;
import se.example.safeauth.pki.IssuedCard;
import se.example.safeauth.pki.PemCodec;
import se.example.safeauth.pki.RootCaGenerator;
import se.example.safeauth.pki.RootCertificateAuthority;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** End-to-end tests for the tap: certificate plus passcode, in exchange for tokens. */
@SpringBootTest
@AutoConfigureMockMvc
class TapEndpointTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private Clock clock;

    @Autowired
    private ObjectMapper json;

    private String tapBody(String pem, String passcode) throws Exception {
        return json.writeValueAsString(new java.util.LinkedHashMap<>(
                java.util.Map.of("certificatePem", pem, "passcode", passcode)));
    }

    private String certificateOf(String cardId) throws Exception {
        return mvc.perform(get("/api/cards/{id}/certificate", cardId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void lists_both_cards_without_leaking_anything() throws Exception {
        mvc.perform(get("/api/cards"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value("card-blue"))
                .andExpect(jsonPath("$[1].id").value("card-red"))
                // A summary carries an id and a label. No certificate, no entitlements,
                // nothing that would let a front end decide what the safe contains.
                .andExpect(jsonPath("$[0].entitlements").doesNotExist())
                .andExpect(jsonPath("$[0].certificate").doesNotExist());
    }

    @Test
    void serves_a_card_certificate_as_pem() throws Exception {
        mvc.perform(get("/api/cards/card-red/certificate"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.startsWith("-----BEGIN CERTIFICATE-----")));
    }

    @Test
    void unknown_card_is_a_404() throws Exception {
        mvc.perform(get("/api/cards/card-green/certificate"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("unknown_card"));
    }

    /** REQUIRED TEST 1: a certificate signed by a rogue CA is rejected at /api/tap. */
    @Test
    void a_card_signed_by_a_rogue_ca_is_rejected() throws Exception {
        // A complete, well-formed CA that this service has simply never heard of. The
        // forger grants themselves both entitlements and copies the real CA's name — our
        // generator uses a fixed subject, so the names match exactly. Only the signature
        // gives it away.
        RootCertificateAuthority rogue = new RootCaGenerator().generate(clock);
        IssuedCard forged = new CardCertificateIssuer()
                .issue(rogue, "card-red", List.of("safe:boat", "safe:key"), clock);

        mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tapBody(PemCodec.toPem(forged.certificate()), "7731")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_card"))
                // No token is issued, not even a scopeless one.
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    /** REQUIRED TEST 2: a valid certificate with the wrong passcode returns 401. */
    @Test
    void a_genuine_card_with_the_wrong_passcode_is_rejected() throws Exception {
        String pem = certificateOf("card-red");

        mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tapBody(pem, "0000")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test
    void a_blank_passcode_is_a_401_not_a_500() throws Exception {
        String pem = certificateOf("card-red");

        mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tapBody(pem, "")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void junk_in_place_of_a_certificate_is_a_401() throws Exception {
        mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tapBody("not a certificate", "7731")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_card"));
    }

    @Test
    void a_correct_tap_returns_both_tokens() throws Exception {
        String pem = certificateOf("card-red");

        mvc.perform(post("/api/tap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tapBody(pem, "7731")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.idToken").isNotEmpty())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresIn").value(300));
    }

    @Test
    void publishes_the_public_signing_key_and_only_the_public_half() throws Exception {
        mvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys[0].kty").value("EC"))
                .andExpect(jsonPath("$.keys[0].crv").value("P-256"))
                .andExpect(jsonPath("$.keys[0].alg").value("ES256"))
                .andExpect(jsonPath("$.keys[0].kid").isNotEmpty())
                // "d" is the private scalar. Publishing it would hand over the signing key.
                .andExpect(jsonPath("$.keys[0].d").doesNotExist());
    }
}

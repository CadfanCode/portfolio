package se.example.safeauth.api;

import java.time.Clock;
import java.time.Instant;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import se.example.safeauth.api.dto.TapRequest;
import se.example.safeauth.api.dto.TapResponse;
import se.example.safeauth.card.PasscodeVault;
import se.example.safeauth.pki.CertificateChainVerifier;
import se.example.safeauth.pki.VerifiedCard;
import se.example.safeauth.token.AccessTokenIssuer;
import se.example.safeauth.token.IdTokenIssuer;

/**
 * The tap: a certificate and a passcode in, two tokens out. The whole authentication
 * event happens in one method, and the order of the two checks is the lesson in it.
 *
 * <p><strong>The certificate is verified first, always.</strong> Two reasons, both real.
 *
 * <p>First, until the CA's signature has been checked, the identity in the request is
 * only a claim. The card id used to select a passcode entry comes out of the certificate
 * — so checking a passcode before verifying the certificate means picking which stored
 * hash to compare against on the caller's say-so. Verify who is speaking, then check what
 * they know.
 *
 * <p>Second, cost. Verifying a signature is a few hundred microseconds of elliptic-curve
 * maths on bytes the client already sent. Checking a passcode is 210,000 PBKDF2
 * iterations, deliberately. Doing the cheap check first means a request carrying garbage
 * is refused before this endpoint spends any real CPU on it, so it cannot be used as an
 * amplifier by anyone who cannot produce a genuine card.
 */
@RestController
public class TapController {

    private final CertificateChainVerifier verifier;
    private final PasscodeVault vault;
    private final IdTokenIssuer idTokens;
    private final AccessTokenIssuer accessTokens;
    private final Clock clock;

    public TapController(CertificateChainVerifier verifier, PasscodeVault vault,
                         IdTokenIssuer idTokens, AccessTokenIssuer accessTokens, Clock clock) {
        this.verifier = verifier;
        this.vault = vault;
        this.idTokens = idTokens;
        this.accessTokens = accessTokens;
        this.clock = clock;
    }

    @PostMapping("/api/tap")
    public TapResponse tap(@RequestBody TapRequest request) {
        // 1. Verify the card. Anything wrong with it — unparseable, issued by a stranger,
        //    signature that does not check out, expired, no entitlements — throws, and the
        //    handler turns every one of those into a 401. Nothing below runs on a card we
        //    could not place. The VerifiedCard that comes back is the proof it passed.
        VerifiedCard card = verifier.verify(request.certificatePem());

        // 2. Only now the passcode, and only against the id the signed certificate gave us.
        String passcode = request.passcode();
        if (passcode == null || passcode.isBlank()) {
            // A missing passcode is a failed tap, not a broken server. The vault would
            // return false for it anyway, but saying so here keeps a null out of the
            // hashing code, where it would surface as a 500 and tell the caller far more
            // about the internals than a 401 does.
            throw new InvalidPasscodeException();
        }
        if (!vault.verify(card.cardId(), passcode)) {
            throw new InvalidPasscodeException();
        }

        // 3. Both halves passed, so this instant is when authentication actually happened.
        //    It goes into auth_time, which is a different fact from the token's issue time:
        //    a relying party that demands a fresh login reads auth_time, not iat.
        Instant authTime = Instant.now(clock);

        return new TapResponse(
                idTokens.issue(card, authTime),
                accessTokens.issue(card),
                accessTokens.expiresInSeconds());
    }
}

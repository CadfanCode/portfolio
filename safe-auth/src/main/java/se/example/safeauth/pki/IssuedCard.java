package se.example.safeauth.pki;

import java.security.KeyPair;
import java.security.cert.X509Certificate;

/**
 * What comes out of the card production line: a certificate, and the key pair it
 * describes.
 *
 * <p>In the physical world these two halves never travel together. A smartcard generates
 * its own key pair inside the chip, sends only a certificate signing request to the CA,
 * and the private key never leaves the card for its whole life — that is the property
 * that makes a card hard to clone. Here the "factory" and the "card" are the same process,
 * so we hold both.
 *
 * <p>The private key is unused by the current tap flow, which accepts a certificate plus
 * a passcode. It is kept because it is where a proof-of-possession step would plug in:
 * the server issues a nonce, the card signs it with this key, and possession of the
 * certificate stops being sufficient. See the README.
 */
public record IssuedCard(X509Certificate certificate, KeyPair keyPair) {
}

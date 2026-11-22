//! PKCE (RFC 7636, S256) and the per-attempt nonce.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// 48 random bytes -> 64 URL-safe characters (the RFC allows 43..=128).
fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn new_verifier() -> String {
    random_token(48)
}

/// 16 random bytes: the value of `attempt` in the callback URL.
pub fn new_nonce() -> String {
    random_token(16)
}

pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_challenge_matches_the_rfc_7636_example() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn verifier_and_nonce_are_long_unique_and_url_safe() {
        let (a, b) = (new_verifier(), new_verifier());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert!(new_nonce().len() >= 22);
        assert_ne!(new_nonce(), new_nonce());
    }
}

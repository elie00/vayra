//! VAYRA Connect payloads that carry secrets — addon addresses often hold a
//! debrid key — are sealed with the pairing secret both ends already share,
//! since the socket itself is plain ws:// on the local network. Shared by the
//! Mac (connect.rs) and the phone (connect_link.rs).

use base64::{engine::general_purpose::STANDARD, Engine};
use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey, CHACHA20_POLY1305, NONCE_LEN};
use ring::hkdf::{Salt, HKDF_SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{json, Value};

const SALT: &[u8] = b"vayra-connect";
const INFO: &[u8] = b"vayra-connect-seal-v1";
const MAX_ADDONS: usize = 64;
const MAX_NAME_CHARS: usize = 80;
const MAX_URL_CHARS: usize = 2048;

fn key(secret: &str) -> LessSafeKey {
    let prk = Salt::new(HKDF_SHA256, SALT).extract(secret.as_bytes());
    let okm = prk.expand(&[INFO], &CHACHA20_POLY1305).expect("a ChaCha20 key fits HKDF-SHA256");
    LessSafeKey::new(UnboundKey::from(okm))
}

/// `nonce || ciphertext || tag`, base64.
pub fn seal(secret: &str, plain: &[u8]) -> Option<String> {
    let mut nonce = [0u8; NONCE_LEN];
    SystemRandom::new().fill(&mut nonce).ok()?;
    let mut sealed = plain.to_vec();
    key(secret)
        .seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce), Aad::empty(), &mut sealed)
        .ok()?;
    let mut out = nonce.to_vec();
    out.extend(sealed);
    Some(STANDARD.encode(out))
}

/// The plain bytes, or `None` for anything not sealed with this secret.
pub fn open(secret: &str, sealed: &str) -> Option<Vec<u8>> {
    let raw = STANDARD.decode(sealed).ok()?;
    if raw.len() < NONCE_LEN + aead::MAX_TAG_LEN {
        return None;
    }
    let (nonce, rest) = raw.split_at(NONCE_LEN);
    let nonce = Nonce::try_assume_unique_for_key(nonce).ok()?;
    let mut buf = rest.to_vec();
    let plain = key(secret).open_in_place(nonce, Aad::empty(), &mut buf).ok()?;
    Some(plain.to_vec())
}

/// The Mac's addons as phones may install them: a name and an http(s)
/// address each, rebuilt from those fields only.
pub fn clean_addons(value: &Value) -> Vec<Value> {
    value
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|addon| {
                    let url = addon["transportUrl"].as_str()?.trim();
                    let web = url.starts_with("https://") || url.starts_with("http://");
                    if !web || url.chars().count() > MAX_URL_CHARS {
                        return None;
                    }
                    let name: String = addon["name"].as_str().unwrap_or("").trim().chars().take(MAX_NAME_CHARS).collect();
                    Some(json!({ "name": name, "transportUrl": url }))
                })
                .take(MAX_ADDONS)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_with_the_pairing_secret() {
        let sealed = seal("pairing-secret", b"[1,2]").unwrap();
        assert_eq!(open("pairing-secret", &sealed).unwrap(), b"[1,2]");
        assert!(open("another-secret", &sealed).is_none());
        let mut tampered = STANDARD.decode(&sealed).unwrap();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(open("pairing-secret", &STANDARD.encode(tampered)).is_none());
        assert!(open("pairing-secret", "not base64 !").is_none());
    }

    #[test]
    fn keeps_web_addresses_and_names_only() {
        let addons = clean_addons(&json!([
            { "name": "Torrentio", "transportUrl": "https://torrentio.example/key=abc/manifest.json", "manifest": { "big": true } },
            { "name": "Local", "transportUrl": "file:///etc/passwd" },
            { "transportUrl": "http://192.168.1.4:7000/manifest.json" },
            "not an addon",
        ]));
        assert_eq!(
            addons,
            vec![
                json!({ "name": "Torrentio", "transportUrl": "https://torrentio.example/key=abc/manifest.json" }),
                json!({ "name": "", "transportUrl": "http://192.168.1.4:7000/manifest.json" }),
            ]
        );
    }
}

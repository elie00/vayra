//! Windows Credential Manager caps a secret at 2560 bytes, and keyring stores
//! passwords as UTF-16, so anything over 1280 UTF-16 units fails to save. A
//! Supabase session is about three times that. Long values are split across
//! `<user>#<i>` entries behind a manifest in the `<user>` entry; short values,
//! and every value on platforms without the limit, are stored as before.

const MANIFEST_PREFIX: &str = "vayra-chunked:v1:";
// Below the 1280-unit hard limit, with room to spare.
#[cfg(windows)]
const MAX_UTF16_UNITS: usize = 1200;
#[cfg(not(windows))]
const MAX_UTF16_UNITS: usize = usize::MAX;

fn chunk_user(user: &str, index: usize) -> String {
    format!("{user}#{index}")
}

fn manifest_count(value: &str) -> Option<usize> {
    value
        .strip_prefix(MANIFEST_PREFIX)
        .and_then(|n| n.parse().ok())
        .filter(|n| *n > 0)
}

/// Splits on char boundaries so that every part fits in `max` UTF-16 units.
fn split_utf16(value: &str, max: usize) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut units = 0;
    for (i, c) in value.char_indices() {
        let width = c.len_utf16();
        if units + width > max {
            parts.push(&value[start..i]);
            start = i;
            units = 0;
        }
        units += width;
    }
    parts.push(&value[start..]);
    parts
}

fn entry(service: &str, user: &str) -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(service, user)
}

fn stored_chunks(service: &str, user: &str) -> keyring::Result<usize> {
    match entry(service, user)?.get_password() {
        Ok(head) => Ok(manifest_count(&head).unwrap_or(0)),
        Err(keyring::Error::NoEntry) => Ok(0),
        Err(e) => Err(e),
    }
}

fn delete_chunks(service: &str, user: &str, from: usize, to: usize) -> keyring::Result<()> {
    for i in from..=to {
        match entry(service, &chunk_user(user, i))?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

pub fn get(service: &str, user: &str) -> keyring::Result<String> {
    let head = entry(service, user)?.get_password()?;
    let Some(count) = manifest_count(&head) else {
        return Ok(head);
    };
    let mut value = String::new();
    for i in 1..=count {
        value.push_str(&entry(service, &chunk_user(user, i))?.get_password()?);
    }
    Ok(value)
}

pub fn set(service: &str, user: &str, value: &str) -> keyring::Result<()> {
    let previous = stored_chunks(service, user)?;
    let parts = if value.encode_utf16().count() > MAX_UTF16_UNITS {
        split_utf16(value, MAX_UTF16_UNITS)
    } else {
        Vec::new()
    };
    // Chunks go first so the manifest never points at parts that are not written yet.
    for (i, part) in parts.iter().enumerate() {
        entry(service, &chunk_user(user, i + 1))?.set_password(part)?;
    }
    let head = if parts.is_empty() {
        value.to_string()
    } else {
        format!("{MANIFEST_PREFIX}{}", parts.len())
    };
    entry(service, user)?.set_password(&head)?;
    if previous > parts.len() {
        delete_chunks(service, user, parts.len() + 1, previous)?;
    }
    Ok(())
}

pub fn delete(service: &str, user: &str) -> keyring::Result<()> {
    let previous = stored_chunks(service, user)?;
    entry(service, user)?.delete_credential()?;
    delete_chunks(service, user, 1, previous)
}

#[cfg(test)]
mod tests {
    use super::{manifest_count, split_utf16, MANIFEST_PREFIX};

    #[test]
    fn splits_long_values_without_breaking_characters() {
        let value = format!("{}é😀{}", "a".repeat(1199), "b".repeat(2500));
        let parts = split_utf16(&value, 1200);
        assert!(parts.iter().all(|p| p.encode_utf16().count() <= 1200));
        assert_eq!(parts.concat(), value);
        assert_eq!(parts[0], format!("{}é", "a".repeat(1199)));
    }

    #[test]
    fn short_values_stay_whole() {
        assert_eq!(split_utf16("session", 1200), vec!["session"]);
    }

    #[test]
    fn only_a_well_formed_manifest_counts() {
        assert_eq!(manifest_count(&format!("{MANIFEST_PREFIX}3")), Some(3));
        assert_eq!(manifest_count(&format!("{MANIFEST_PREFIX}0")), None);
        assert_eq!(manifest_count(&format!("{MANIFEST_PREFIX}x")), None);
        assert_eq!(manifest_count("{\"access_token\":\"…\"}"), None);
    }
}

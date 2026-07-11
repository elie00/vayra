use tauri::Manager;

const KEYRING_SERVICE: &str = "app.harbor";
const KEYRING_USER: &str = "settings-secrets-v1";
const AUTH_KEYRING_SERVICE: &str = "app.harbor.auth";

fn credential_account(account: &str) -> Result<&str, String> {
    if !account.is_empty()
        && account.len() <= 128
        && account
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b':' | b'.'))
    {
        Ok(account)
    } else {
        Err("invalid credential account".to_string())
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn settings_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn settings_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Reads the sensitive settings blob from the operating system credential store.
/// Android keeps using its app-private settings file until native Keystore support
/// is wired in, so these commands deliberately become a no-op there.
#[tauri::command]
pub fn settings_secrets_read() -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("credential entry: {e}"))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("credential read: {e}")),
        }
    }
    #[cfg(not(desktop))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn settings_secrets_write(content: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("credential entry: {e}"))?;
        entry
            .set_password(&content)
            .map_err(|e| format!("credential write: {e}"))
    }
    #[cfg(not(desktop))]
    {
        let _ = content;
        Err("secure credential storage is not available on this platform".to_string())
    }
}

#[tauri::command]
pub fn auth_secret_read(account: String) -> Result<Option<String>, String> {
    let account = credential_account(&account)?;
    #[cfg(desktop)]
    {
        let entry = keyring::Entry::new(AUTH_KEYRING_SERVICE, account)
            .map_err(|e| format!("credential entry: {e}"))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("credential read: {e}")),
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = account;
        Ok(None)
    }
}

#[tauri::command]
pub fn auth_secret_write(account: String, content: Option<String>) -> Result<(), String> {
    let account = credential_account(&account)?;
    #[cfg(desktop)]
    {
        let entry = keyring::Entry::new(AUTH_KEYRING_SERVICE, account)
            .map_err(|e| format!("credential entry: {e}"))?;
        match content {
            Some(value) => entry
                .set_password(&value)
                .map_err(|e| format!("credential write: {e}")),
            None => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(format!("credential delete: {e}")),
            },
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (account, content);
        Err("secure credential storage is not available on this platform".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::credential_account;

    #[test]
    fn credential_accounts_are_restricted() {
        assert_eq!(credential_account("profile-1").unwrap(), "profile-1");
        assert!(credential_account("").is_err());
        assert!(credential_account("../../other").is_err());
        assert!(credential_account("profile name").is_err());
    }
}

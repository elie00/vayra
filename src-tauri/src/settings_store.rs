use tauri::Manager;

#[cfg(desktop)]
const KEYRING_SERVICE: &str = "app.harbor";
const KEYRING_USER: &str = "settings-secrets-v1";
#[cfg(desktop)]
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
/// Desktop uses the native keyring and Android uses an AES-GCM key held by the
/// Android Keystore through the JNI helper below.
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
    #[cfg(target_os = "android")]
    {
        android_keystore::read(KEYRING_USER)
    }
    #[cfg(all(not(desktop), not(target_os = "android")))]
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
    #[cfg(target_os = "android")]
    {
        android_keystore::write(KEYRING_USER, Some(content.as_str()))
    }
    #[cfg(all(not(desktop), not(target_os = "android")))]
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
    #[cfg(target_os = "android")]
    {
        android_keystore::read(account)
    }
    #[cfg(all(not(desktop), not(target_os = "android")))]
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
    #[cfg(target_os = "android")]
    {
        android_keystore::write(account, content.as_deref())
    }
    #[cfg(all(not(desktop), not(target_os = "android")))]
    {
        let _ = (account, content);
        Err("secure credential storage is not available on this platform".to_string())
    }
}

/// Stockage chiffré des credentials côté Android : les commandes appellent
/// l'objet Kotlin `app.harbor.HarborCredentials` par réflexion JNI (clé
/// AES-256-GCM non exportable dans l'Android Keystore, blobs chiffrés dans
/// `filesDir/harbor-credentials/<account>`). Le contexte Android (JavaVM +
/// application) est publié par wry via `ndk-context`.
#[cfg(target_os = "android")]
mod android_keystore {
    use jni::objects::{JClass, JObject, JString, JValue};
    use jni::JNIEnv;

    const HELPER_CLASS: &str = "app.harbor.HarborCredentials";

    pub fn read(account: &str) -> Result<Option<String>, String> {
        let (vm, context) = vm_and_context()?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| format!("jni attach: {e}"))?;
        let class = load_helper_class(&mut env, &context)?;
        let jaccount = env
            .new_string(account)
            .map_err(|e| format!("jni string: {e}"))?;
        let result = env
            .call_static_method(
                &class,
                "read",
                "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&context), JValue::Object(jaccount.as_ref())],
            )
            .and_then(|v| v.l());
        match result {
            Ok(obj) if obj.as_raw().is_null() => Ok(None),
            Ok(obj) => {
                let jvalue = JString::from(obj);
                let value = env
                    .get_string(&jvalue)
                    .map_err(|e| format!("jni string: {e}"))?
                    .into();
                Ok(Some(value))
            }
            Err(e) => Err(format!("keystore read: {}", describe(&mut env, e))),
        }
    }

    pub fn write(account: &str, content: Option<&str>) -> Result<(), String> {
        let (vm, context) = vm_and_context()?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| format!("jni attach: {e}"))?;
        let class = load_helper_class(&mut env, &context)?;
        let jaccount = env
            .new_string(account)
            .map_err(|e| format!("jni string: {e}"))?;
        let result = match content {
            Some(value) => {
                let jvalue = env
                    .new_string(value)
                    .map_err(|e| format!("jni string: {e}"))?;
                env.call_static_method(
                    &class,
                    "write",
                    "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)V",
                    &[
                        JValue::Object(&context),
                        JValue::Object(jaccount.as_ref()),
                        JValue::Object(jvalue.as_ref()),
                    ],
                )
            }
            None => env.call_static_method(
                &class,
                "delete",
                "(Landroid/content/Context;Ljava/lang/String;)V",
                &[JValue::Object(&context), JValue::Object(jaccount.as_ref())],
            ),
        };
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("keystore write: {}", describe(&mut env, e))),
        }
    }

    fn vm_and_context() -> Result<(jni::JavaVM, JObject<'static>), String> {
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| format!("jvm: {e}"))?;
        // Référence globale détenue par ndk-context : on l'emballe sans en
        // prendre possession (JObject ne libère rien au drop).
        let context = unsafe { JObject::from_raw(ctx.context().cast()) };
        Ok((vm, context))
    }

    /// Charge la classe helper via le class loader de l'application :
    /// `FindClass` ne voit que les classes système depuis un thread natif.
    fn load_helper_class<'local>(
        env: &mut JNIEnv<'local>,
        context: &JObject,
    ) -> Result<JClass<'local>, String> {
        let loader = env
            .call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
            .and_then(|v| v.l())
            .map_err(|e| format!("class loader: {}", describe(env, e)))?;
        let name = env
            .new_string(HELPER_CLASS)
            .map_err(|e| format!("jni string: {e}"))?;
        let class = env
            .call_method(
                &loader,
                "loadClass",
                "(Ljava/lang/String;)Ljava/lang/Class;",
                &[JValue::Object(name.as_ref())],
            )
            .and_then(|v| v.l())
            .map_err(|e| format!("load {HELPER_CLASS}: {}", describe(env, e)))?;
        Ok(JClass::from(class))
    }

    /// Convertit une erreur JNI en message lisible en capturant (et purgeant)
    /// l'exception Java pendante le cas échéant.
    fn describe(env: &mut JNIEnv, err: jni::errors::Error) -> String {
        if env.exception_check().unwrap_or(false) {
            let throwable = env.exception_occurred();
            let _ = env.exception_clear();
            if let Ok(throwable) = throwable {
                if let Ok(msg) = env
                    .call_method(&throwable, "toString", "()Ljava/lang/String;", &[])
                    .and_then(|v| v.l())
                {
                    let jmsg = JString::from(msg);
                    let text = env.get_string(&jmsg).map(String::from);
                    if let Ok(text) = text {
                        return text;
                    }
                }
            }
        }
        err.to_string()
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

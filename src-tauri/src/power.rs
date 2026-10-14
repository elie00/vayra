#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::NSString;

    const IDLE_DISPLAY_SLEEP_DISABLED: u64 = 1 << 40;
    const IDLE_SYSTEM_SLEEP_DISABLED: u64 = 1 << 20;

    pub struct Token(Retained<AnyObject>);
    unsafe impl Send for Token {}

    pub fn begin() -> Option<Token> {
        let cls = AnyClass::get(c"NSProcessInfo")?;
        unsafe {
            let info: *mut AnyObject = msg_send![cls, processInfo];
            let info = info.as_ref()?;
            let reason = NSString::from_str("VAYRA playback");
            let opts: u64 = IDLE_DISPLAY_SLEEP_DISABLED | IDLE_SYSTEM_SLEEP_DISABLED;
            let token: Retained<AnyObject> =
                msg_send![info, beginActivityWithOptions: opts, reason: &*reason];
            Some(Token(token))
        }
    }

    pub fn end(token: Token) {
        let Some(cls) = AnyClass::get(c"NSProcessInfo") else { return };
        unsafe {
            let info: *mut AnyObject = msg_send![cls, processInfo];
            let Some(info) = info.as_ref() else { return };
            let _: () = msg_send![info, endActivity: &*token.0];
        }
    }
}

/// Windows power requests are handle-based, so unlike SetThreadExecutionState
/// they hold no matter which runtime thread runs the command.
#[cfg(windows)]
mod win {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Power::{
        PowerClearRequest, PowerCreateRequest, PowerRequestDisplayRequired,
        PowerRequestSystemRequired, PowerSetRequest,
    };
    use windows::Win32::System::Threading::{
        POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0,
    };

    // POWER_REQUEST_CONTEXT_VERSION
    const CONTEXT_VERSION: u32 = 0;

    pub struct Token(HANDLE);
    unsafe impl Send for Token {}

    pub fn begin() -> Option<Token> {
        let mut reason: Vec<u16> = "VAYRA playback".encode_utf16().chain(Some(0)).collect();
        let context = REASON_CONTEXT {
            Version: CONTEXT_VERSION,
            Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
            Reason: REASON_CONTEXT_0 { SimpleReasonString: PWSTR(reason.as_mut_ptr()) },
        };
        unsafe {
            let handle = PowerCreateRequest(&context).ok()?;
            if PowerSetRequest(handle, PowerRequestDisplayRequired).is_err() {
                let _ = CloseHandle(handle);
                return None;
            }
            let _ = PowerSetRequest(handle, PowerRequestSystemRequired);
            Some(Token(handle))
        }
    }

    pub fn end(token: Token) {
        unsafe {
            let _ = PowerClearRequest(token.0, PowerRequestDisplayRequired);
            let _ = PowerClearRequest(token.0, PowerRequestSystemRequired);
            let _ = CloseHandle(token.0);
        }
    }
}

#[cfg(target_os = "macos")]
use mac as platform;
#[cfg(windows)]
use win as platform;

#[cfg(any(target_os = "macos", windows))]
static TOKEN: std::sync::Mutex<Option<platform::Token>> = std::sync::Mutex::new(None);

#[tauri::command]
pub fn power_inhibit(on: bool) {
    #[cfg(any(target_os = "macos", windows))]
    {
        let mut guard = TOKEN.lock().unwrap();
        match (on, guard.take()) {
            (true, None) => *guard = platform::begin(),
            (true, Some(t)) => *guard = Some(t),
            (false, Some(t)) => platform::end(t),
            (false, None) => {}
        }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = on;
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn a_playback_power_request_is_taken_and_released() {
        let token = super::win::begin().expect("power request");
        super::win::end(token);
    }
}

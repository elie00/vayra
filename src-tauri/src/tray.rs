use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static ALWAYS_ON_TOP: AtomicBool = AtomicBool::new(false);
static PAUSE_MINIMIZED: AtomicBool = AtomicBool::new(true);
static PAUSE_UNFOCUSED: AtomicBool = AtomicBool::new(false);

pub fn close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct TrayPrefs {
    pub close_to_tray: bool,
    pub always_on_top: bool,
    pub pause_minimized: bool,
    pub pause_unfocused: bool,
}

#[derive(Clone, Copy)]
enum Pref {
    CloseToTray,
    AlwaysOnTop,
    PauseMinimized,
    PauseUnfocused,
}

struct TrayItems {
    always_on_top: CheckMenuItem<Wry>,
    pause_minimized: CheckMenuItem<Wry>,
    pause_unfocused: CheckMenuItem<Wry>,
    close_to_tray: CheckMenuItem<Wry>,
}

fn current_prefs() -> TrayPrefs {
    TrayPrefs {
        close_to_tray: CLOSE_TO_TRAY.load(Ordering::Relaxed),
        always_on_top: ALWAYS_ON_TOP.load(Ordering::Relaxed),
        pause_minimized: PAUSE_MINIMIZED.load(Ordering::Relaxed),
        pause_unfocused: PAUSE_UNFOCUSED.load(Ordering::Relaxed),
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        #[cfg(windows)]
        crate::force_show_foreground(&window);
    }
}

fn apply_always_on_top(app: &AppHandle, on: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(on);
    }
}

fn toggle(app: &AppHandle, pref: Pref) {
    let flag = match pref {
        Pref::CloseToTray => &CLOSE_TO_TRAY,
        Pref::AlwaysOnTop => &ALWAYS_ON_TOP,
        Pref::PauseMinimized => &PAUSE_MINIMIZED,
        Pref::PauseUnfocused => &PAUSE_UNFOCUSED,
    };
    let next = !flag.load(Ordering::Relaxed);
    flag.store(next, Ordering::Relaxed);
    if let Some(items) = app.try_state::<TrayItems>() {
        let item = match pref {
            Pref::CloseToTray => &items.close_to_tray,
            Pref::AlwaysOnTop => &items.always_on_top,
            Pref::PauseMinimized => &items.pause_minimized,
            Pref::PauseUnfocused => &items.pause_unfocused,
        };
        let _ = item.set_checked(next);
    }
    if matches!(pref, Pref::AlwaysOnTop) {
        apply_always_on_top(app, next);
    }
    let _ = app.emit("harbor://tray-prefs", current_prefs());
}

#[tauri::command]
pub fn tray_set_prefs(app: AppHandle, prefs: TrayPrefs) {
    CLOSE_TO_TRAY.store(prefs.close_to_tray, Ordering::Relaxed);
    ALWAYS_ON_TOP.store(prefs.always_on_top, Ordering::Relaxed);
    PAUSE_MINIMIZED.store(prefs.pause_minimized, Ordering::Relaxed);
    PAUSE_UNFOCUSED.store(prefs.pause_unfocused, Ordering::Relaxed);
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.close_to_tray.set_checked(prefs.close_to_tray);
        let _ = items.always_on_top.set_checked(prefs.always_on_top);
        let _ = items.pause_minimized.set_checked(prefs.pause_minimized);
        let _ = items.pause_unfocused.set_checked(prefs.pause_unfocused);
    }
    apply_always_on_top(&app, prefs.always_on_top);
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "tray_show", "Show Harbor", true, None::<&str>)?;
    let always_on_top = CheckMenuItem::with_id(
        app,
        "tray_aot",
        "Always on Top",
        true,
        ALWAYS_ON_TOP.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let pause_minimized = CheckMenuItem::with_id(
        app,
        "tray_pmin",
        "Pause When Minimized",
        true,
        PAUSE_MINIMIZED.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let pause_unfocused = CheckMenuItem::with_id(
        app,
        "tray_punf",
        "Pause When Unfocused",
        true,
        PAUSE_UNFOCUSED.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let close_to_tray = CheckMenuItem::with_id(
        app,
        "tray_ctt",
        "Close to Tray",
        true,
        CLOSE_TO_TRAY.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray_quit", "Quit Harbor", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &always_on_top,
            &pause_minimized,
            &pause_unfocused,
            &close_to_tray,
            &sep,
            &quit,
        ],
    )?;

    app.manage(TrayItems {
        always_on_top: always_on_top.clone(),
        pause_minimized: pause_minimized.clone(),
        pause_unfocused: pause_unfocused.clone(),
        close_to_tray: close_to_tray.clone(),
    });

    let mut builder = TrayIconBuilder::with_id("harbor-tray")
        .tooltip("Harbor")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_show" => show_main(app),
            "tray_aot" => toggle(app, Pref::AlwaysOnTop),
            "tray_pmin" => toggle(app, Pref::PauseMinimized),
            "tray_punf" => toggle(app, Pref::PauseUnfocused),
            "tray_ctt" => toggle(app, Pref::CloseToTray),
            "tray_quit" => {
                if let Some(w) = app.get_webview_window("main") {
                    crate::CLOSE_FLUSH_DONE.store(false, Ordering::SeqCst);
                    let _ = w.emit("harbor://app-closing", ());
                    for _ in 0..16 {
                        if crate::CLOSE_FLUSH_DONE.load(Ordering::SeqCst) {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                }
                crate::shutdown_services(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let restore = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if restore {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

//! AppKit owns the full-screen Space and restores its window frame. Tauri's
//! is_fullscreen() changes as soon as a transition is requested, before the
//! animation finishes (and even if AppKit subsequently refuses the request).
use block2::RcBlock;
use objc2_app_kit::{
    NSWindow, NSWindowCollectionBehavior, NSWindowDidEnterFullScreenNotification,
    NSWindowDidExitFullScreenNotification, NSWindowStyleMask, NSWindowTitleVisibility,
    NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter};
use std::{ptr::NonNull, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{watch, Mutex};

pub struct FullscreenState {
    confirmed: watch::Sender<bool>,
    transition: Mutex<()>,
}

impl FullscreenState {
    pub fn new() -> Self {
        Self {
            confirmed: watch::channel(false).0,
            transition: Mutex::new(()),
        }
    }
}

fn apply_fullscreen_chrome(
    window: &NSWindow,
    fullscreen: bool,
    windowed_titlebar: bool,
    windowed_title_visibility: NSWindowTitleVisibility,
) {
    crate::mpv_render_mac::apply_dark_appearance(window);
    // An opaque or light title bar paints a white strip / hairline above WKWebView
    // when macOS reveals the menu bar in full screen.
    window.setTitlebarAppearsTransparent(fullscreen || windowed_titlebar);
    window.setTitleVisibility(if fullscreen {
        NSWindowTitleVisibility::Hidden
    } else {
        windowed_title_visibility
    });
    crate::mpv_render_mac::set_window_corner_radius(window, fullscreen);
}

pub fn install(app: &AppHandle, window: &NSWindow) {
    window.setCollectionBehavior(
        window.collectionBehavior()
            | NSWindowCollectionBehavior::FullScreenPrimary
            | NSWindowCollectionBehavior::Managed,
    );
    let state = app.state::<FullscreenState>();
    let active = window.styleMask().contains(NSWindowStyleMask::FullScreen);
    state.confirmed.send_replace(active);
    let windowed_titlebar = window.titlebarAppearsTransparent();
    let windowed_title_visibility = window.titleVisibility();
    apply_fullscreen_chrome(window, active, windowed_titlebar, windowed_title_visibility);

    let center = NSNotificationCenter::defaultCenter();

    // Remove rounding and opaque titlebar before the entrance animation starts.
    let will_enter_handler = RcBlock::new(move |notification: NonNull<NSNotification>| {
        let object = unsafe { notification.as_ref() }.object();
        if let Some(window) = object
            .as_deref()
            .and_then(|obj| obj.downcast_ref::<NSWindow>())
        {
            apply_fullscreen_chrome(window, true, windowed_titlebar, windowed_title_visibility);
        }
    });
    unsafe {
        let _ = center.addObserverForName_object_queue_usingBlock(
            Some(NSWindowWillEnterFullScreenNotification),
            Some(window),
            None,
            &will_enter_handler,
        );
    }

    for (name, active) in unsafe {
        [
            (NSWindowDidEnterFullScreenNotification, true),
            (NSWindowDidExitFullScreenNotification, false),
        ]
    } {
        let app = app.clone();
        let handler = RcBlock::new(move |notification: NonNull<NSNotification>| {
            // Window notifications are delivered synchronously on AppKit's main thread.
            let object = unsafe { notification.as_ref() }.object();
            if let Some(window) = object
                .as_deref()
                .and_then(|obj| obj.downcast_ref::<NSWindow>())
            {
                apply_fullscreen_chrome(
                    window,
                    active,
                    windowed_titlebar,
                    windowed_title_visibility,
                );
                crate::mpv_render_mac::sync_content_subviews(window);
            }
            app.state::<FullscreenState>()
                .confirmed
                .send_replace(active);
            let event = if active {
                "fs://entered"
            } else {
                "fs://exited"
            };
            let _ = app.emit_to("main", event, ());
        });
        // The center retains the block registration for the main window's lifetime.
        unsafe {
            let _ = center.addObserverForName_object_queue_usingBlock(
                Some(name),
                Some(window),
                None,
                &handler,
            );
        }
    }
}

#[tauri::command]
pub fn window_fullscreen_status(state: State<'_, FullscreenState>) -> bool {
    *state.confirmed.borrow()
}

async fn transition(
    app: &AppHandle,
    state: &FullscreenState,
    target: bool,
    center_on_exit: bool,
) -> Result<(), String> {
    let _lock = state.transition.lock().await;
    let main = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    let mut confirmed = state.confirmed.subscribe();
    if *confirmed.borrow() == target && main.is_fullscreen().map_err(|e| e.to_string())? == target {
        return Ok(());
    }
    // Unmaximizing here starts a second animation that competes with entry.
    if target {
        main.set_focus().map_err(|e| e.to_string())?;
    }
    main.set_fullscreen(target).map_err(|e| e.to_string())?;
    tokio::time::timeout(
        Duration::from_secs(4),
        confirmed.wait_for(|active| *active == target),
    )
    .await
    .map_err(|_| "AppKit did not complete the full-screen transition".to_owned())?
    .map_err(|e| e.to_string())?;
    if center_on_exit && !main.is_maximized().map_err(|e| e.to_string())? {
        main.center().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_fullscreen_enter(
    app: AppHandle,
    state: State<'_, FullscreenState>,
) -> Result<(), String> {
    transition(&app, &state, true, false).await
}

#[tauri::command]
pub async fn window_fullscreen_exit(
    app: AppHandle,
    state: State<'_, FullscreenState>,
    restore_position: Option<bool>,
) -> Result<(), String> {
    transition(&app, &state, false, restore_position == Some(false)).await
}

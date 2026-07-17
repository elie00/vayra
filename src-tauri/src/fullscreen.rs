use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct FullscreenState {
    #[allow(clippy::type_complexity)] // (x, y, w, h, was_maximized) sauvegardés sous lock partagé
    saved: Arc<Mutex<Option<(i32, i32, u32, u32, bool)>>>,
}

impl FullscreenState {
    pub fn new() -> Self {
        Self {
            saved: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn window_fullscreen_enter(
    app: AppHandle,
    state: State<'_, FullscreenState>,
) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;

    let already_fs = main.is_fullscreen().unwrap_or(false);
    if !already_fs {
        let was_maximized = main.is_maximized().unwrap_or(false);
        if let (Ok(pos), Ok(sz)) = (main.outer_position(), main.inner_size()) {
            *state.saved.lock().unwrap() =
                Some((pos.x, pos.y, sz.width, sz.height, was_maximized));
        }
        if was_maximized {
            let _ = main.unmaximize();
        }
        main.set_fullscreen(true)
            .map_err(|e| format!("set_fullscreen(true): {}", e))?;
        let _ = main.set_focus();
    }
    let _ = app.emit_to("main", "fs://entered", ());
    Ok(())
}

#[tauri::command]
pub async fn window_fullscreen_exit(
    app: AppHandle,
    state: State<'_, FullscreenState>,
    restore_position: Option<bool>,
) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;

    let is_fs = main.is_fullscreen().unwrap_or(false);
    if is_fs {
        main.set_fullscreen(false)
            .map_err(|e| format!("set_fullscreen(false): {}", e))?;
        // macOS anime la sortie de fullscreen : une géométrie appliquée pendant
        // la transition est avalée et la fenêtre retombe sur son cadre
        // pré-fullscreen. Attendre la fin de la transition avant de restaurer.
        for _ in 0..20u8 {
            if !main.is_fullscreen().unwrap_or(false) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        let saved = state.saved.lock().unwrap().take();
        if let Some((x, y, w, h, was_maximized)) = saved {
            if was_maximized {
                // enter() a dû dé-maximiser avant le fullscreen ; rendre à la
                // fenêtre son état maximisé plutôt que le petit cadre.
                for _ in 0..10u8 {
                    let _ = main.maximize();
                    if main.is_maximized().unwrap_or(false) {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(60)).await;
                }
            } else {
                let _ = main.set_size(tauri::PhysicalSize { width: w, height: h });
                if restore_position.unwrap_or(true) {
                    let _ = main.set_position(tauri::PhysicalPosition { x, y });
                } else {
                    let _ = main.center();
                }
            }
        } else {
            let _ = main.center();
        }
        let _ = main.set_focus();
    }
    let _ = app.emit_to("main", "fs://exited", ());
    Ok(())
}

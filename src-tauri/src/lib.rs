mod anime4k;
mod browser;
mod cast;
mod cast_hls;
mod cast_server;
mod cf_relay;
mod discord_rp;
mod dlna;
mod dvr;
mod fullscreen;
mod http_fetch;
mod local_lib;
mod modal_overlay;
mod mpv;
mod multiview;
mod proc_mem;
mod roku;
#[cfg(target_os = "macos")]
mod mpv_render_mac;
mod pip;
mod airplay;
mod stream_proxy;
mod streams;
mod thumbs;
mod trailer;
mod transcode;
mod webview_helpers;

#[tauri::command]
async fn deeplink_set_stremio(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    if enabled {
        app.deep_link()
            .register("stremio")
            .map_err(|e| format!("register stremio: {}", e))?;
    } else {
        let _ = app.deep_link().unregister("stremio");
    }
    Ok(())
}

#[tauri::command]
async fn deeplink_is_stremio_registered(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    app.deep_link()
        .is_registered("stremio")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    let target = std::path::PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create folder: {}", e))?;
        }
    }
    std::fs::write(&target, contents.as_bytes()).map_err(|e| format!("write file: {}", e))
}

#[cfg(windows)]
fn make_main_transparent(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[harbor::transparent] main window missing");
        return;
    };
    let res = window.with_webview(|webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
        };
        use windows::core::Interface;
        let controller = webview.controller();
        match controller.cast::<ICoreWebView2Controller2>() {
            Ok(controller2) => {
                let color = COREWEBVIEW2_COLOR { A: 0, R: 255, G: 255, B: 255 };
                match controller2.SetDefaultBackgroundColor(color) {
                    Ok(()) => eprintln!("[harbor::transparent] SetDefaultBackgroundColor OK (alpha=0)"),
                    Err(e) => eprintln!("[harbor::transparent] SetDefaultBackgroundColor FAILED: {:?}", e),
                }
            }
            Err(e) => eprintln!("[harbor::transparent] cast to Controller2 FAILED: {:?}", e),
        }
    });
    if let Err(e) = res {
        eprintln!("[harbor::transparent] with_webview FAILED: {:?}", e);
    }
}

#[tauri::command]
fn harbor_set_webview_memory_low(app: tauri::AppHandle, low: bool) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
            };
            use windows::core::Interface;
            let controller = webview.controller();
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(w3) = core.cast::<ICoreWebView2_19>() {
                    let level = if low {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                    } else {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                    };
                    let _ = w3.SetMemoryUsageTargetLevel(level);
                }
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (&app, low);
    }
}

#[tauri::command]
fn harbor_set_webview_visible(app: tauri::AppHandle, visible: bool) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            let _ = webview.controller().SetIsVisible(visible);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (&app, visible);
    }
}

#[tauri::command]
fn harbor_try_suspend_webview(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
            use webview2_com::TrySuspendCompletedHandler;
            use windows::core::Interface;
            let controller = webview.controller();
            let _ = controller.SetIsVisible(false);
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(c3) = core.cast::<ICoreWebView2_3>() {
                    let handler = TrySuspendCompletedHandler::create(Box::new(|_hr, _ok| Ok(())));
                    let _ = c3.TrySuspend(&handler);
                }
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = &app;
    }
}

#[tauri::command]
fn harbor_resume_webview(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
            use windows::core::Interface;
            let controller = webview.controller();
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(c3) = core.cast::<ICoreWebView2_3>() {
                    let _ = c3.Resume();
                }
            }
            let _ = controller.SetIsVisible(true);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = &app;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    trailer::sweep_cache();
    let proxy_state = tauri::async_runtime::block_on(stream_proxy::ProxyState::start())
        .unwrap_or_else(|e| {
            eprintln!("[stream-proxy] failed to start: {}", e);
            stream_proxy::ProxyState::placeholder()
        });
    let mpv_state = mpv::MpvState::new();
    let pip_state = pip::PipState::new();
    let fullscreen_state = fullscreen::FullscreenState::new();
    let thumbs_state = thumbs::ThumbsState::new();
    let dvr_state = dvr::DvrState::new();
    let multiview_state = multiview::MultiviewState::new();
    let modal_overlay_state = modal_overlay::ModalOverlayState::new();
    let app_builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::{Emitter, Manager};
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if let Some(url) = args.iter().find(|a| a.starts_with("harbor://")) {
                let _ = app.emit("harbor:stremio-deeplink", url.clone());
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(proxy_state)
        .manage(mpv_state)
        .manage(pip_state)
        .manage(fullscreen_state)
        .manage(thumbs_state)
        .manage(dvr_state)
        .manage(multiview_state)
        .manage(modal_overlay_state)
        .manage(discord_rp::DiscordState::new());

    #[cfg(target_os = "macos")]
    let app_builder = app_builder.register_uri_scheme_protocol("stremio", |ctx, request| {
        use tauri::Emitter;
        let url = request.uri().to_string();
        let _ = ctx.app_handle().emit("harbor:stremio-deeplink", url);
        tauri::http::Response::builder()
            .status(200)
            .header("content-type", "text/html; charset=utf-8")
            .body(b"<!doctype html><meta charset=\"utf-8\"><title>Harbor</title>".to_vec())
            .unwrap()
    });

    app_builder
        .setup(move |app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("[harbor::deep-link] register_all failed: {:?}", e);
                }
            }
            #[cfg(windows)]
            make_main_transparent(&app.handle());
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.handle().get_webview_window("main") {
                    if let Ok(ns_window) = window.ns_window() {
                        let ns_window_ptr = ns_window as i64;
                        if let Err(e) = mpv_render_mac::install_window_rounding(ns_window_ptr) {
                            eprintln!("[harbor::mac] rounding failed: {}", e);
                        }
                        if let Err(e) = mpv_render_mac::make_resizable(ns_window_ptr) {
                            eprintln!("[harbor::mac] resizable failed: {}", e);
                        }
                    }
                }
            }
            cast_server::ensure_started_on_setup(&app.handle());
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || discord_rp::run_loop(handle));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                use tauri::Manager;
                cast_server::stop();
                discord_rp::shutdown(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            harbor_set_webview_memory_low,
            harbor_set_webview_visible,
            harbor_try_suspend_webview,
            harbor_resume_webview,
            save_text_file,
            cast_server::stop_stremio_sidecar,
            anime4k::anime4k_download,
            anime4k::anime4k_dir,
            proc_mem::harbor_process_memory,
            trailer::fetch_trailer,
            stream_proxy::proxy_register,
            stream_proxy::proxy_unregister,
            stream_proxy::proxy_gc_idle,
            cf_relay::cf_list_accounts,
            cf_relay::cf_deploy_relay,
            cf_relay::cf_delete_relay,
            cf_relay::cf_relay_status,
            mpv::mpv_probe,
            mpv::mpv_start,
            mpv::mpv_command,
            mpv::mpv_set_property,
            mpv::mpv_set_geometry,
            mpv::mpv_set_clip_rects,
            mpv::mpv_force_below,
            webview_helpers::webview_reapply_transparency,
            mpv::mpv_on_pip_changed,
            mpv::mpv_screenshot_data_url,
            mpv::mpv_save_screenshot,
            mpv::mpv_gif_start,
            mpv::mpv_gif_stop,
            mpv::mpv_gif_abort,
            modal_overlay::modal_overlay_open,
            modal_overlay::modal_overlay_close,
            modal_overlay::modal_overlay_emit_state,
            modal_overlay::modal_overlay_emit_action,
            modal_overlay::modal_overlay_sync,
            modal_overlay::modal_overlay_get_pending,
            mpv::mpv_sub_add,
            mpv::sub_download,
            mpv::mpv_stop,
            pip::pip_open,
            pip::pip_get_session,
            pip::pip_close,
            pip::pip_publish_state,
            pip::window_pip_enter,
            pip::window_pip_exit,
            fullscreen::window_fullscreen_enter,
            fullscreen::window_fullscreen_exit,
            browser::browser_open,
            browser::browser_close,
            thumbs::thumbs_set_url,
            thumbs::thumbs_spawn_eager,
            thumbs::thumbs_get,
            thumbs::thumbs_stop,
            dvr::dvr_start,
            dvr::dvr_stop,
            dvr::dvr_list,
            dvr::dvr_default_dir,
            dvr::dvr_reveal,
            multiview::multiview_open,
            multiview::multiview_prespawn,
            multiview::multiview_geometry,
            multiview::multiview_audio_focus,
            multiview::multiview_close,
            multiview::multiview_visibility,
            multiview::multiview_stop_all,
            http_fetch::harbor_fetch,
            discord_rp::discord_set_presence,
            discord_rp::discord_clear,
            discord_rp::discord_set_enabled,
            cast::cast_discover,
            cast::cast_load,
            cast::cast_play,
            cast::cast_pause,
            cast::cast_seek,
            cast::cast_stop,
            cast::cast_status,
            cast_server::cast_server_status,
            cast_server::cast_server_restart,
            transcode::cast_ffmpeg_present,
            streams::streams_run_pipeline,
            streams::streams_parse,
            streams::streams_core_version,
            local_lib::harbor_scan_folder,
            deeplink_set_stremio,
            deeplink_is_stremio_registered,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

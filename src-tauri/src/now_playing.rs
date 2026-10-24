//! System media controls for the mpv player on macOS: Control Center, media keys
//! and headphones. HTML5 playback gets them from the WebView's Media Session.

use serde::Deserialize;
#[cfg(target_os = "macos")]
use serde::Serialize;

#[cfg(target_os = "macos")]
pub const COMMAND_EVENT: &str = "vayra:now-playing-command";

// Only the macOS backend reads it; elsewhere the commands do nothing.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Deserialize)]
pub struct NowPlayingInfo {
    title: String,
    duration: f64,
    position: f64,
    rate: f64,
    playing: bool,
}

#[cfg(target_os = "macos")]
#[derive(Clone, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Play,
    Pause,
    Toggle,
    Skip { seconds: f64 },
    Seek { position: f64 },
}

#[tauri::command]
pub fn now_playing_update(app: tauri::AppHandle, info: NowPlayingInfo) {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || mac::update(&handle, &info));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, info);
}

#[tauri::command]
pub fn now_playing_clear(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(mac::clear);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{Command, NowPlayingInfo, COMMAND_EVENT};
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSArray, NSMutableDictionary, NSNumber, NSString};
    use objc2_media_player::{
        MPChangePlaybackPositionCommandEvent, MPMediaItemPropertyPlaybackDuration, MPMediaItemPropertyTitle,
        MPNowPlayingInfoCenter, MPNowPlayingInfoMediaType, MPNowPlayingInfoPropertyElapsedPlaybackTime,
        MPNowPlayingInfoPropertyMediaType, MPNowPlayingInfoPropertyPlaybackRate, MPNowPlayingPlaybackState,
        MPRemoteCommand, MPRemoteCommandCenter, MPRemoteCommandEvent, MPRemoteCommandHandlerStatus,
        MPSkipIntervalCommandEvent,
    };
    use std::cell::Cell;
    use std::ptr::NonNull;
    use tauri::Emitter;

    const SKIP_SECONDS: f64 = 10.0;

    thread_local! {
        static REGISTERED: Cell<bool> = const { Cell::new(false) };
    }

    fn on(
        app: &tauri::AppHandle,
        command: &MPRemoteCommand,
        read: impl Fn(&MPRemoteCommandEvent) -> Command + 'static,
    ) {
        let app = app.clone();
        let handler = RcBlock::new(move |event: NonNull<MPRemoteCommandEvent>| {
            let command = read(unsafe { event.as_ref() });
            match app.emit(COMMAND_EVENT, command) {
                Ok(()) => MPRemoteCommandHandlerStatus::Success,
                Err(_) => MPRemoteCommandHandlerStatus::CommandFailed,
            }
        });
        unsafe { command.addTargetWithHandler(&handler) };
    }

    // Targets are added once; `set_enabled` hands the controls to VAYRA only
    // while mpv plays something.
    fn register(app: &tauri::AppHandle) {
        if REGISTERED.replace(true) {
            return;
        }
        unsafe {
            let center = MPRemoteCommandCenter::sharedCommandCenter();
            on(app, &center.playCommand(), |_| Command::Play);
            on(app, &center.pauseCommand(), |_| Command::Pause);
            on(app, &center.togglePlayPauseCommand(), |_| Command::Toggle);
            let intervals = NSArray::from_retained_slice(&[NSNumber::new_f64(SKIP_SECONDS)]);
            let forward = center.skipForwardCommand();
            forward.setPreferredIntervals(&intervals);
            on(app, &forward, |event| Command::Skip { seconds: skip_interval(event) });
            let backward = center.skipBackwardCommand();
            backward.setPreferredIntervals(&intervals);
            on(app, &backward, |event| Command::Skip { seconds: -skip_interval(event) });
            on(app, &center.changePlaybackPositionCommand(), |event| {
                let event = &*(event as *const MPRemoteCommandEvent as *const MPChangePlaybackPositionCommandEvent);
                Command::Seek { position: event.positionTime() }
            });
        }
    }

    fn skip_interval(event: &MPRemoteCommandEvent) -> f64 {
        let event = unsafe { &*(event as *const MPRemoteCommandEvent as *const MPSkipIntervalCommandEvent) };
        let interval = unsafe { event.interval() };
        if interval > 0.0 { interval } else { SKIP_SECONDS }
    }

    fn set_enabled(enabled: bool) {
        unsafe {
            let center = MPRemoteCommandCenter::sharedCommandCenter();
            center.playCommand().setEnabled(enabled);
            center.pauseCommand().setEnabled(enabled);
            center.togglePlayPauseCommand().setEnabled(enabled);
            center.skipForwardCommand().setEnabled(enabled);
            center.skipBackwardCommand().setEnabled(enabled);
            center.changePlaybackPositionCommand().setEnabled(enabled);
        }
    }

    pub fn update(app: &tauri::AppHandle, info: &NowPlayingInfo) {
        register(app);
        set_enabled(true);
        let dict: Retained<NSMutableDictionary<NSString, AnyObject>> = NSMutableDictionary::new();
        unsafe {
            dict.insert(MPMediaItemPropertyTitle, &*NSString::from_str(&info.title));
            if info.duration.is_finite() && info.duration > 0.0 {
                dict.insert(MPMediaItemPropertyPlaybackDuration, &*NSNumber::new_f64(info.duration));
            }
            dict.insert(MPNowPlayingInfoPropertyElapsedPlaybackTime, &*NSNumber::new_f64(info.position.max(0.0)));
            let rate = if info.playing { info.rate } else { 0.0 };
            dict.insert(MPNowPlayingInfoPropertyPlaybackRate, &*NSNumber::new_f64(rate));
            dict.insert(
                MPNowPlayingInfoPropertyMediaType,
                &*NSNumber::new_usize(MPNowPlayingInfoMediaType::Video.0),
            );
            let center = MPNowPlayingInfoCenter::defaultCenter();
            center.setNowPlayingInfo(Some(&**dict));
            center.setPlaybackState(if info.playing {
                MPNowPlayingPlaybackState::Playing
            } else {
                MPNowPlayingPlaybackState::Paused
            });
        }
    }

    pub fn clear() {
        set_enabled(false);
        unsafe {
            let center = MPNowPlayingInfoCenter::defaultCenter();
            center.setNowPlayingInfo(None);
            center.setPlaybackState(MPNowPlayingPlaybackState::Stopped);
        }
    }
}

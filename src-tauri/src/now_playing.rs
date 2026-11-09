//! System media controls for the mpv player: Control Center and headphones on
//! macOS, the volume flyout on Windows, and media keys on both. HTML5 playback
//! gets them from the WebView's Media Session.

use serde::Deserialize;
#[cfg(any(target_os = "macos", windows))]
use serde::Serialize;

#[cfg(any(target_os = "macos", windows))]
pub const COMMAND_EVENT: &str = "vayra:now-playing-command";

// Only the macOS and Windows backends read it; elsewhere the commands do nothing.
#[cfg_attr(not(any(target_os = "macos", windows)), allow(dead_code))]
#[derive(Deserialize)]
pub struct NowPlayingInfo {
    title: String,
    duration: f64,
    position: f64,
    rate: f64,
    playing: bool,
}

#[cfg(any(target_os = "macos", windows))]
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    Play,
    Pause,
    #[cfg(target_os = "macos")]
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
    #[cfg(windows)]
    {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || smtc::update(&handle, &info));
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = (app, info);
}

#[tauri::command]
pub fn now_playing_clear(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(mac::clear);
    #[cfg(windows)]
    let _ = app.run_on_main_thread(smtc::clear);
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = app;
}

#[cfg(windows)]
mod smtc {
    use super::{Command, NowPlayingInfo, COMMAND_EVENT};
    use std::cell::RefCell;
    use tauri::{Emitter, Manager};
    use windows::core::{factory, Ref, Result, HSTRING};
    use windows::Foundation::{TimeSpan, TypedEventHandler};
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs,
        SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs, SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

    const SKIP_SECONDS: f64 = 10.0;
    const TICKS_PER_SECOND: f64 = 10_000_000.0;

    thread_local! {
        static CONTROLS: RefCell<Option<SystemMediaTransportControls>> = const { RefCell::new(None) };
    }

    fn command_for(button: SystemMediaTransportControlsButton) -> Option<Command> {
        match button {
            SystemMediaTransportControlsButton::Play => Some(Command::Play),
            SystemMediaTransportControlsButton::Pause => Some(Command::Pause),
            SystemMediaTransportControlsButton::Next | SystemMediaTransportControlsButton::FastForward => {
                Some(Command::Skip { seconds: SKIP_SECONDS })
            }
            SystemMediaTransportControlsButton::Previous | SystemMediaTransportControlsButton::Rewind => {
                Some(Command::Skip { seconds: -SKIP_SECONDS })
            }
            _ => None,
        }
    }

    fn time_span(seconds: f64) -> TimeSpan {
        TimeSpan { Duration: (seconds.max(0.0) * TICKS_PER_SECOND) as i64 }
    }

    // Handlers are added once; `SetIsEnabled` hands the controls to VAYRA only
    // while mpv plays something.
    fn create(app: &tauri::AppHandle) -> Result<SystemMediaTransportControls> {
        let window = app.get_webview_window("main").ok_or_else(windows::core::Error::empty)?;
        let hwnd = window.hwnd().map_err(|_| windows::core::Error::empty())?;
        let interop = factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd) }?;

        let handle = app.clone();
        controls.ButtonPressed(&TypedEventHandler::new(
            move |_, args: Ref<SystemMediaTransportControlsButtonPressedEventArgs>| {
                if let Some(command) = args.as_ref().and_then(|a| a.Button().ok()).and_then(command_for) {
                    let _ = handle.emit(COMMAND_EVENT, command);
                }
                Ok(())
            },
        ))?;
        let handle = app.clone();
        controls.PlaybackPositionChangeRequested(&TypedEventHandler::new(
            move |_, args: Ref<PlaybackPositionChangeRequestedEventArgs>| {
                if let Some(span) = args.as_ref().and_then(|a| a.RequestedPlaybackPosition().ok()) {
                    let position = span.Duration as f64 / TICKS_PER_SECOND;
                    let _ = handle.emit(COMMAND_EVENT, Command::Seek { position });
                }
                Ok(())
            },
        ))?;

        controls.SetIsPlayEnabled(true)?;
        controls.SetIsPauseEnabled(true)?;
        controls.SetIsNextEnabled(true)?;
        controls.SetIsPreviousEnabled(true)?;
        controls.SetIsFastForwardEnabled(true)?;
        controls.SetIsRewindEnabled(true)?;
        Ok(controls)
    }

    fn publish(controls: &SystemMediaTransportControls, info: &NowPlayingInfo) -> Result<()> {
        controls.SetIsEnabled(true)?;
        let display = controls.DisplayUpdater()?;
        display.SetType(MediaPlaybackType::Video)?;
        display.VideoProperties()?.SetTitle(&HSTRING::from(info.title.as_str()))?;
        display.Update()?;
        controls.SetPlaybackStatus(if info.playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        })?;
        if info.rate.is_finite() && info.rate > 0.0 {
            controls.SetPlaybackRate(info.rate)?;
        }
        if info.duration.is_finite() && info.duration > 0.0 {
            let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
            timeline.SetStartTime(time_span(0.0))?;
            timeline.SetMinSeekTime(time_span(0.0))?;
            timeline.SetEndTime(time_span(info.duration))?;
            timeline.SetMaxSeekTime(time_span(info.duration))?;
            timeline.SetPosition(time_span(info.position))?;
            controls.UpdateTimelineProperties(&timeline)?;
        }
        Ok(())
    }

    pub fn update(app: &tauri::AppHandle, info: &NowPlayingInfo) {
        CONTROLS.with(|slot| {
            let mut slot = slot.borrow_mut();
            if slot.is_none() {
                match create(app) {
                    Ok(controls) => *slot = Some(controls),
                    Err(e) => {
                        eprintln!("[now-playing] media controls unavailable: {e}");
                        return;
                    }
                }
            }
            if let Some(controls) = slot.as_ref() {
                if let Err(e) = publish(controls, info) {
                    eprintln!("[now-playing] update failed: {e}");
                }
            }
        });
    }

    pub fn clear() {
        CONTROLS.with(|slot| {
            if let Some(controls) = slot.borrow().as_ref() {
                let cleared = controls
                    .SetPlaybackStatus(MediaPlaybackStatus::Closed)
                    .and_then(|_| controls.DisplayUpdater()?.ClearAll())
                    .and_then(|_| controls.SetIsEnabled(false));
                if let Err(e) = cleared {
                    eprintln!("[now-playing] clear failed: {e}");
                }
            }
        });
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn media_keys_map_to_player_commands() {
            use SystemMediaTransportControlsButton as Button;
            assert_eq!(command_for(Button::Play), Some(Command::Play));
            assert_eq!(command_for(Button::Pause), Some(Command::Pause));
            assert_eq!(command_for(Button::Next), Some(Command::Skip { seconds: 10.0 }));
            assert_eq!(command_for(Button::Rewind), Some(Command::Skip { seconds: -10.0 }));
            assert_eq!(command_for(Button::Stop), None);
        }

        #[test]
        fn times_are_counted_in_ticks_and_never_negative() {
            assert_eq!(time_span(1.5).Duration, 15_000_000);
            assert_eq!(time_span(-3.0).Duration, 0);
        }
    }
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

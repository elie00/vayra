!macro NSIS_HOOK_PREINSTALL
  ; Force-close any running sidecars (mpv, ffmpeg, ffprobe, yt-dlp, stremio-server) so their
  ; .exe files aren't locked when we overwrite them during an install / update / reinstall.
  ; Path-scoped to $INSTDIR so a user's OWN mpv/ffmpeg/yt-dlp running elsewhere is never touched (no regressions),
  ; and both current and legacy app executables are left to Tauri's own running-app close handling.
  nsExec::Exec `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -like '$INSTDIR\*' -and $$_.Name -notin @('VAYRA.exe', 'Harbor.exe') } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  ; Fallback for the uniquely-named server sidecar in case PowerShell is unavailable on the machine.
  ; Wildcard matches both stremio-server.exe and the triple-suffixed stremio-server-<triple>.exe; /T kills children.
  nsExec::Exec 'taskkill /F /T /FI "IMAGENAME eq stremio-server*"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM stremio-server.exe'
  Pop $0
  Sleep 1000
!macroend

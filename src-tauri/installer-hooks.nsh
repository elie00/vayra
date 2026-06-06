!macro NSIS_HOOK_PREINSTALL
  ; Harbor: stop the stremio-server sidecar so its .exe isn't locked when we overwrite it during an update.
  ; Wildcard matches both stremio-server.exe and the triple-suffixed stremio-server-<triple>.exe; /T kills children.
  nsExec::Exec 'taskkill /F /T /FI "IMAGENAME eq stremio-server*"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM stremio-server.exe'
  Pop $0
  Sleep 1000
!macroend

# Flatpak packaging

Harbor is built as `site.harbor.Harbor` against the pinned GNOME 49 SDK. mpv is
built in the sandbox, FFmpeg tools come from the SDK and use the codecs supplied
through the matching platform runtime, and yt-dlp is installed at a digest-pinned
version. No host multimedia tools are visible to the application.

Build locally with the runtimes listed in the manifest installed:

```sh
flatpak-builder --user --force-clean --repo=/tmp/harbor-flatpak-repo /tmp/harbor-flatpak-build flatpak/site.harbor.Harbor.yml
flatpak build-bundle /tmp/harbor-flatpak-repo Harbor.flatpak site.harbor.Harbor
flatpak install --user Harbor.flatpak
```

The package intentionally grants no home or host filesystem access. File and
folder choices are made through the desktop portal. Runtime smoke tests should
cover Wayland and X11, AMD and NVIDIA, WebKit rendering, mpv hardware decode,
FFmpeg casting/transcoding, trailers, torrents, localhost playback, audio, deep
links, tray integration, Discord IPC, and portal-selected media/download paths.

To audit the sandbox, run `flatpak run --command=sh site.harbor.Harbor` and verify
that `/usr/bin/mpv`, `/usr/bin/ffmpeg`, and `/usr/bin/yt-dlp` do not exist; the
packaged commands must resolve under `/app/bin`.

# VAYRA visual identity

VAYRA uses the **Mineral Monochrome** system. Its visual character comes from
contrast, spacing, typography, and restrained surface depth rather than a
high-chroma brand accent.

## Core palette

| Role | Value | Usage |
| --- | --- | --- |
| Mineral black | `#0A0B0D` | App canvas, icon field, and email background |
| Ivory | `#F4F2ED` | Primary text and light-field mark |
| Titanium | `#A8AAAD` | Primary actions, active states, focus, and dark-field mark |
| Graphite | `#4B4D50` | Borders, separators, and light-field mark |

Supporting surfaces stay neutral: `#111214` for surfaces, `#18191C` for
elevated content, `#242529` for raised controls, and `#737579` for subtle text.

## Rules

- The VAYRA mark keeps the approved two-ribbon geometry unchanged.
- Brand UI does not use violet, blue, orange, neon, or multicolour gradients.
- Titanium is an emphasis colour, not a decorative wash. Large areas remain
  mineral black, ivory, or neutral graphite.
- Red, green, and yellow are allowed only when their semantic meaning is
  necessary: error, success, warning, playback level, or source health.
- External-service logos and artwork keep their own colours.
- User-selected profile colours, seek-bar colours, imported themes, and theme
  gallery presets are customisation surfaces, not VAYRA brand colours.
- Player colour updates must remain presentational. Playback, libmpv, cast,
  HDR, shaders, VEYA synchronisation, and Stremio behaviour are not changed by
  a brand pass.

## Source assets

Editable sources live under `src/assets/brand/vayra/`. The deterministic icon
source is `vayra-icon-source.svg`; `vayra-icon-source-1024.png` is its rendered
platform input. `vayra-logo-review.svg` and its PNG rendering verify the mark at
full size, 32 px, and 16 px on dark and light fields.

Platform icons are generated from the approved 1024 px source with:

```sh
pnpm exec tauri icon src/assets/brand/vayra/vayra-icon-source-1024.png
```

The macOS `icon.icns` remains a dedicated squircle export from
`vayra-icon-macos.svg`. Windows installer artwork is regenerated with:

```sh
node src-tauri/installer/generate-art.mjs
```

## Product surfaces

The default app tokens and the `VAYRA default` theme are the canonical runtime
implementation. The same palette is mirrored in the passwordless email
templates under `supabase/templates/` and in the hosted Supabase project.

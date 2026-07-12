// Versioned, bundled data source for the theme gallery. Every theme is expressed in the
// native import format understood by parseThemeJson (@/lib/custom-themes), so
// installing goes through the exact same pipeline as importing a theme file. New
// entries can be shipped with regular VAYRA releases without requiring a service.

export type GalleryTheme = {
  name: string;
  author: string;
  blurb: string;
  swatch: [string, string, string];
  /** Full color tokens, when known. Enables the hover preview. */
  tokens?: Record<string, string>;
  /** Embedded entries: theme JSON ready for the import pipeline. */
  json: string;
};

type NativeTheme = {
  name: string;
  blurb: string;
  swatch: [string, string, string];
  tokens: Record<string, string>;
};

const STARTERS: NativeTheme[] = [
  {
    name: "Solarized Dark",
    blurb: "The classic low-contrast teal palette by Ethan Schoonover.",
    swatch: ["#002b36", "#073642", "#268bd2"],
    tokens: {
      "--color-canvas": "#002b36",
      "--color-surface": "#05353f",
      "--color-elevated": "#073642",
      "--color-raised": "#0e4956",
      "--color-ink": "#eee8d5",
      "--color-ink-muted": "#93a1a1",
      "--color-ink-subtle": "#657b83",
      "--color-edge": "#1a4f5aa0",
      "--color-edge-soft": "#1a4f5a4d",
      "--color-accent": "#268bd2",
      "--color-accent-soft": "#268bd22e",
      "--color-danger": "#dc322f",
    },
  },
  {
    name: "Catppuccin Mocha",
    blurb: "Soothing pastels on a warm dark base. Mauve accent.",
    swatch: ["#181825", "#313244", "#cba6f7"],
    tokens: {
      "--color-canvas": "#181825",
      "--color-surface": "#1e1e2e",
      "--color-elevated": "#313244",
      "--color-raised": "#45475a",
      "--color-ink": "#cdd6f4",
      "--color-ink-muted": "#a6adc8",
      "--color-ink-subtle": "#6c7086",
      "--color-edge": "#45475aa0",
      "--color-edge-soft": "#45475a4d",
      "--color-accent": "#cba6f7",
      "--color-accent-soft": "#cba6f72e",
      "--color-danger": "#f38ba8",
    },
  },
  {
    name: "Gruvbox Dark",
    blurb: "Retro groove: warm earthy browns with a punchy orange.",
    swatch: ["#1d2021", "#3c3836", "#fe8019"],
    tokens: {
      "--color-canvas": "#1d2021",
      "--color-surface": "#282828",
      "--color-elevated": "#3c3836",
      "--color-raised": "#504945",
      "--color-ink": "#ebdbb2",
      "--color-ink-muted": "#bdae93",
      "--color-ink-subtle": "#7c6f64",
      "--color-edge": "#504945a0",
      "--color-edge-soft": "#5049454d",
      "--color-accent": "#fe8019",
      "--color-accent-soft": "#fe80192e",
      "--color-danger": "#fb4934",
    },
  },
  {
    name: "Tokyo Night",
    blurb: "Deep indigo night with neon blue highlights.",
    swatch: ["#16161e", "#24283b", "#7aa2f7"],
    tokens: {
      "--color-canvas": "#16161e",
      "--color-surface": "#1a1b26",
      "--color-elevated": "#24283b",
      "--color-raised": "#2f3549",
      "--color-ink": "#c0caf5",
      "--color-ink-muted": "#a9b1d6",
      "--color-ink-subtle": "#565f89",
      "--color-edge": "#3b4261a0",
      "--color-edge-soft": "#3b42614d",
      "--color-accent": "#7aa2f7",
      "--color-accent-soft": "#7aa2f72e",
      "--color-danger": "#f7768e",
    },
  },
  {
    name: "Rosé Pine Dawn",
    blurb: "A soft light theme: warm parchment with a rose accent.",
    swatch: ["#faf4ed", "#f2e9e1", "#b4637a"],
    tokens: {
      "--color-canvas": "#faf4ed",
      "--color-surface": "#fffaf3",
      "--color-elevated": "#f2e9e1",
      "--color-raised": "#e6ddd5",
      "--color-ink": "#575279",
      "--color-ink-muted": "#797593",
      "--color-ink-subtle": "#9893a5",
      "--color-edge": "#cecacda0",
      "--color-edge-soft": "#cecacd4d",
      "--color-accent": "#b4637a",
      "--color-accent-soft": "#b4637a2e",
      "--color-danger": "#c94f4f",
    },
  },
];

export const STARTER_GALLERY_THEMES: GalleryTheme[] = STARTERS.map((theme) => ({
  name: theme.name,
  author: "VAYRA",
  blurb: theme.blurb,
  swatch: theme.swatch,
  tokens: theme.tokens,
  json: JSON.stringify(theme),
}));

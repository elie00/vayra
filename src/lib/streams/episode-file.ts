export type EpisodeHint = { season: number | null; episode: number | null };

const VIDEO_EXT_RE = /\.(mkv|mp4|avi|mov|m4v|webm|ts|flv|wmv|m2ts|mpg|mpeg|ogv|3gp)(\?|#|$)/i;

// Tokens that look like episode numbers but aren't: years, resolutions, codecs, bit depth.
const ABS_NOISE_RE = /\b(?:19|20)\d{2}\b|\b\d{3,4}p\b|\bx26[45]\b|\bh\.?26[45]\b|\b\d{1,2}bit\b/gi;

export function episodeFileRegex(season: number, episode: number): RegExp {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return new RegExp(
    `s0*${season}[^0-9]?e0*${episode}(?![0-9])|${s}${e}(?![0-9])|\\b${season}x0*${episode}(?![0-9])`,
    "i",
  );
}

export function matchEpisodeFileIndex(names: string[], hint: EpisodeHint | undefined): number {
  if (!hint || hint.episode == null) return -1;
  if (hint.season != null) {
    const re = episodeFileRegex(hint.season, hint.episode);
    let anyMatch = -1;
    for (let i = 0; i < names.length; i++) {
      const name = names[i] ?? "";
      if (!re.test(name)) continue;
      if (VIDEO_EXT_RE.test(name)) return i;
      if (anyMatch < 0) anyMatch = i;
    }
    if (anyMatch >= 0) return anyMatch;
  }
  return matchAbsoluteEpisodeIndex(names, hint.episode);
}

// Anime batches usually number files absolutely ("… - 1043 [1080p].mkv") with no
// SxxExx marker, so the pattern above finds nothing. Only accept a bare number when
// exactly one video file carries it — anything ambiguous stays unmatched.
function matchAbsoluteEpisodeIndex(names: string[], episode: number): number {
  const re = new RegExp(`(?:^|[^0-9a-z])0*${episode}(?:v\\d)?(?=[^0-9a-z]|$)`, "i");
  let found = -1;
  for (let i = 0; i < names.length; i++) {
    const name = names[i] ?? "";
    if (!VIDEO_EXT_RE.test(name)) continue;
    if (!re.test(name.replace(ABS_NOISE_RE, " "))) continue;
    if (found >= 0) return -1;
    found = i;
  }
  return found;
}

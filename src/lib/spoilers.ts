export type SpoilerSettings = {
  hideSpoilers: boolean;
  spoilerHideThumbnails: boolean;
  spoilerHideTitles: boolean;
  spoilerHideDescriptions: boolean;
  spoilerSkipNext: boolean;
  blurEpisodes: boolean;
};

export type SpoilerMask = { thumb: boolean; title: boolean; desc: boolean };

const CLEAR: SpoilerMask = { thumb: false, title: false, desc: false };

export const SPOILER_THUMB_CLASS =
  "blur-[14px] scale-[1.04] transition-[filter,transform] duration-200 group-hover:blur-[0px] group-hover:scale-100";
export const SPOILER_TEXT_CLASS =
  "blur-[5px] select-none transition-[filter] duration-200 group-hover:blur-[0px]";

export function spoilerMaskFor(
  s: SpoilerSettings,
  opts: { watched: boolean; isNextUp: boolean },
): SpoilerMask {
  if (!s.hideSpoilers) return CLEAR;
  if (opts.watched) return CLEAR;
  if (s.spoilerSkipNext && opts.isNextUp) return CLEAR;
  return {
    thumb: s.spoilerHideThumbnails,
    title: s.spoilerHideTitles,
    desc: s.spoilerHideDescriptions,
  };
}

/**
 * Whether an episode's own page should hold its images behind a reveal. The list
 * masks above peek on hover, which a full-bleed hero image cannot do: this one
 * waits for a deliberate click instead.
 *
 * An episode already started has nothing left to give away, and the toggle sits
 * inside "Blur spoilers", so it means nothing on its own.
 */
export function episodePageBlurred(
  s: SpoilerSettings,
  opts: { started: boolean },
): boolean {
  if (!s.hideSpoilers || !s.blurEpisodes) return false;
  return !opts.started;
}

export function spoilerActive(mask: SpoilerMask): boolean {
  return mask.thumb || mask.title || mask.desc;
}

export const VAYRA_NATIVE_AUTH_CALLBACK = "vayra://auth/callback";

const AUTH_ENTITY_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/&(?:amp|#0*38|#x0*26);/gi, "&"],
  [/(?:&#x0*20;|&#0*32;|&nbsp;)/gi, ""],
];

export function normalizeVayraAuthUrl(rawUrl: string): string {
  return AUTH_ENTITY_REPLACEMENTS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    rawUrl.trim(),
  );
}

export function vayraAuthRedirectUrl(options?: {
  tauri?: boolean;
  origin?: string;
}): string {
  const tauri =
    options?.tauri ??
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  if (tauri) return VAYRA_NATIVE_AUTH_CALLBACK;

  const origin = options?.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return origin ? `${origin.replace(/\/$/, "")}/auth/callback` : VAYRA_NATIVE_AUTH_CALLBACK;
}

export function isVayraWebAuthCallback(url: URL, origin: string): boolean {
  return url.origin === origin && url.pathname.replace(/\/$/, "") === "/auth/callback";
}

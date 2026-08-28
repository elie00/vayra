const FORBIDDEN_HEADER_NAMES = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "permissions-policy",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
  "via",
]);

export function browserMediaHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const normalized = name.trim().toLowerCase();
      return (
        normalized.length > 0 &&
        !FORBIDDEN_HEADER_NAMES.has(normalized) &&
        !normalized.startsWith("proxy-") &&
        !normalized.startsWith("sec-")
      );
    }),
  );
}

declare const __APP_VERSION__: string;

const ENDPOINT =
  (import.meta.env.VITE_BUG_REPORT_ENDPOINT as string | undefined) ||
  "https://bugs.harbor.site";

export type Severity = "low" | "normal" | "high" | "critical";

export type BugReportInput = {
  summary: string;
  severity: Severity;
  steps: string;
  expected: string;
  actual: string;
  reporterName: string;
  reporterGithub: string;
  reporterContact: string;
  consentCredit: boolean;
  files: File[];
};

export type Diagnostics = {
  appVersion: string;
  channel: "private-beta";
  recentErrors: Array<{ msg: string; src?: string }>;
};

const ERR_BUFFER: Array<{ ts: number; msg: string; src?: string }> = [];
const MAX_ERRORS = 50;
let installed = false;

// Privacy gate: nothing leaving the device may carry a URL, source, addon URL,
// magnet/info-hash or embedded credential. Scrub those from any free-text field
// before it is buffered or shipped in a report.
export function redactSensitive(input: string): string {
  return input
    .replace(/\b(?:https?|wss?|ftp|file|stremio|vayra|harbor):\/\/\S+/gi, "[url]")
    .replace(/\bmagnet:\?\S+/gi, "[magnet]")
    .replace(/\b(?:CIRA|CIRAG|VARA)(?:-[0-9A-Z]{4}){3,6}\b/gi, "[invite]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[token]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[hash]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|var|tmp)\/)[^\s)\]}]+/g, "[path]");
}

export function installBugReportErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    push(`${e.message}${e.filename ? ` (${e.filename}:${e.lineno ?? "?"})` : ""}`, "window.onerror");
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as unknown;
    const msg = r instanceof Error ? `${r.name}: ${r.message}` : String(r);
    push(msg, "unhandledrejection");
  });
}

function push(msg: string, src?: string) {
  ERR_BUFFER.push({ ts: Date.now(), msg: redactSensitive(msg).slice(0, 600), src });
  while (ERR_BUFFER.length > MAX_ERRORS) ERR_BUFFER.shift();
}

export function getRecentErrors() {
  return ERR_BUFFER.slice();
}

export function clearRecentErrors(): void {
  ERR_BUFFER.length = 0;
}

export async function collectDiagnostics(): Promise<Diagnostics> {
  return {
    appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
    channel: "private-beta",
    recentErrors: getRecentErrors().slice(-20).map(({ msg, src }) => ({
      msg: redactSensitive(msg),
      ...(src ? { src: redactSensitive(src) } : {}),
    })),
  };
}

export async function submitErrorReport(args: {
  code: string;
  title: string;
  message: string;
  detail?: string;
}): Promise<{ id: string }> {
  const safeTitle = redactSensitive(args.title);
  const safeMessage = redactSensitive(args.message);
  const summary = `[${args.code}] ${safeTitle}: ${safeMessage}`.slice(0, 240);
  const fd = new FormData();
  fd.set("summary", summary);
  fd.set("severity", "high");
  fd.set("steps", "");
  fd.set("expected", "");
  fd.set("actual", safeMessage);
  fd.set("reporter_name", "");
  fd.set("reporter_github", "");
  fd.set("reporter_contact", "");
  fd.set("consent_credit", "0");
  fd.set("app_version", typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev");
  fd.set("os", "");
  fd.set("os_version", "");
  fd.set("ua", "");
  fd.set("viewport", "");
  fd.set("locale", "");
  // The error overlay is a voluntary report, but its local diagnostic buffer
  // is still a separate consent boundary. Never attach it implicitly.
  fd.set("diagnostics", "{}");
  const res = await fetch(`${ENDPOINT}/v1/reports`, { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as { id: string };
}

export async function submitBugReport(
  input: BugReportInput,
  diag: Diagnostics | null,
): Promise<{ id: string }> {
  const fd = new FormData();
  fd.set("summary", redactSensitive(input.summary));
  fd.set("severity", input.severity);
  fd.set("steps", redactSensitive(input.steps));
  fd.set("expected", redactSensitive(input.expected));
  fd.set("actual", redactSensitive(input.actual));
  fd.set("reporter_name", input.reporterName);
  fd.set("reporter_github", input.reporterGithub);
  fd.set("reporter_contact", input.reporterContact);
  fd.set("consent_credit", input.consentCredit ? "1" : "0");
  fd.set("app_version", diag?.appVersion ?? "not-shared");
  fd.set("os", "");
  fd.set("os_version", "");
  fd.set("ua", "");
  fd.set("viewport", "");
  fd.set("locale", "");
  fd.set("diagnostics", diag ? JSON.stringify(diag) : "{}");
  for (const [index, file] of input.files.entries()) {
    const extension = file.name.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i)?.[1]?.toLowerCase();
    fd.append("files", file, `attachment-${index + 1}${extension ? `.${extension}` : ""}`);
  }

  const res = await fetch(`${ENDPOINT}/v1/reports`, { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as { id: string };
}

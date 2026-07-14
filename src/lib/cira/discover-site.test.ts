import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inviteHtml = readFileSync(new URL("../../../site/public/cira/invite.html", import.meta.url), "utf8");
const vercel = JSON.parse(
  readFileSync(new URL("../../../site/vercel.json", import.meta.url), "utf8"),
) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };

describe("CIRA invitation landing privacy", () => {
  it("keeps the opaque secret in one fragment parameter and clears browser history", () => {
    expect(inviteHtml).toContain("new URLSearchParams((location.hash || \"\").slice(1))");
    expect(inviteHtml).toContain('fragmentEntries.length === 1 && fragmentEntries[0][0] === "t"');
    expect(inviteHtml).not.toMatch(/searchParams\.get\(["']t["']\)/);
    expect(inviteHtml).toContain('history.replaceState(null, "", location.pathname)');
  });

  it("prevents indexing, referrer disclosure, storage and network calls", () => {
    expect(inviteHtml).toContain('name="robots" content="noindex,nofollow,noarchive"');
    expect(inviteHtml).toContain('name="referrer" content="no-referrer"');
    expect(inviteHtml).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage/);

    const route = vercel.headers.find((entry) => entry.source === "/cira/invite");
    expect(route).toBeDefined();
    const headers = Object.fromEntries(route!.headers.map(({ key, value }) => [key, value]));
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Robots-Tag"]).toContain("noindex");
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
});

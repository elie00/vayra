// POST /v1/adreport
// Replaces https://bugs.harbor.site/v1/adreport
//
// Harbor client: src/lib/ad-report/submit.ts -> submitAdReport()
//   POST JSON body: {
//     content: string,                              // opaque fingerprint hash
//     source: string,                               // "ih_..." or "rg_..." prefix
//     ranges: Array<{ start: number, end: number }> // integer seconds, end > start
//   }
//   The client only inspects res.ok, so a 2xx with any JSON body is success.
//
// No DB: forward the submission to a configurable webhook (Discord/Slack).
// If FEEDBACK_WEBHOOK_URL is unset, return 501 not-configured (deploys but inert).

import { cleanLine, enforceRateLimit, readJsonBody } from "../_lib/public-request.js";

export default async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const webhook = process.env.FEEDBACK_WEBHOOK_URL;
  if (!webhook) {
    return res.status(501).json({ error: "not configured", needs: "FEEDBACK_WEBHOOK_URL" });
  }

  if (!enforceRateLimit(req, res, { scope: "adreport", limit: 30, windowMs: 10 * 60_000 })) {
    return;
  }

  const parsed = readJsonBody(req, 8_192);
  if (parsed.error) {
    return res.status(parsed.status).json({ error: parsed.error });
  }
  const body = parsed.body;

  const content = cleanLine(body.content, 192);
  const source = cleanLine(body.source, 384);
  if (!content || (!source.startsWith("ih_") && !source.startsWith("rg_"))) {
    return res.status(400).json({ error: "invalid content or source fingerprint" });
  }
  const ranges = (Array.isArray(body.ranges) ? body.ranges : [])
    .slice(0, 64)
    .map((range) => ({ start: Number(range?.start), end: Number(range?.end) }))
    .filter(
      (range) =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 0 &&
        range.end > range.start &&
        range.end <= 7 * 24 * 60 * 60,
    );
  if (ranges.length === 0) return res.status(400).json({ error: "no valid ranges" });

  const rangesText =
    ranges
      .map((r) => `${r && r.start}s–${r && r.end}s`)
      .join(", ") || "none";

  const text =
    `New ad report\n` +
    `• source: ${source || "n/a"}\n` +
    `• content: ${content || "n/a"}\n` +
    `• ranges: ${rangesText}`;

  try {
    const wr = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, text, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!wr.ok) {
      return res.status(502).json({ error: "webhook failed", status: wr.status });
    }
  } catch (e) {
    return res.status(502).json({ error: "webhook error", detail: String(e && e.message ? e.message : e) });
  }

  return res.status(200).json({ ok: true });
};

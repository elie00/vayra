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

export default async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const webhook = process.env.FEEDBACK_WEBHOOK_URL;
  if (!webhook) {
    return res.status(501).json({ error: "not configured", needs: "FEEDBACK_WEBHOOK_URL" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const content = typeof body.content === "string" ? body.content : "";
  const source = typeof body.source === "string" ? body.source : "";
  const ranges = Array.isArray(body.ranges) ? body.ranges : [];

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
      body: JSON.stringify({ content: text, text }),
    });
    if (!wr.ok) {
      return res.status(502).json({ error: "webhook failed", status: wr.status });
    }
  } catch (e) {
    return res.status(502).json({ error: "webhook error", detail: String(e && e.message ? e.message : e) });
  }

  return res.status(200).json({ ok: true });
};

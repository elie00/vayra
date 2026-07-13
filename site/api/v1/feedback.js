// POST /v1/feedback
// Replaces https://bugs.harbor.site/v1/feedback
//
// Harbor client: src/lib/build-feedback-submit.ts -> submitBuildFeedback()
//   POST JSON body: { version: string, rating: number, beta: boolean }
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

  // Vercel parses JSON bodies automatically; fall back to manual parse if needed.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const version = typeof body.version === "string" ? body.version : "unknown";
  const rating = Number.isFinite(body.rating) ? body.rating : null;
  const beta = body.beta === true;

  const content =
    `New build feedback\n` +
    `• rating: ${rating === null ? "n/a" : `${rating}/5`}\n` +
    `• version: ${version}\n` +
    `• beta: ${beta ? "yes" : "no"}`;

  try {
    // Discord expects { content }; Slack expects { text }. Send both keys so
    // either webhook type accepts the payload.
    const wr = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, text: content }),
    });
    if (!wr.ok) {
      return res.status(502).json({ error: "webhook failed", status: wr.status });
    }
  } catch (e) {
    return res.status(502).json({ error: "webhook error", detail: String(e && e.message ? e.message : e) });
  }

  return res.status(200).json({ ok: true });
};

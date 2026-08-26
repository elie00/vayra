// POST /v1/feedback
// Replaces https://bugs.harbor.site/v1/feedback
//
// Harbor client: src/lib/build-feedback-submit.ts -> submitBuildFeedback()
//   POST JSON body: { version: string, rating: number, beta: boolean }
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

  if (!enforceRateLimit(req, res, { scope: "feedback", limit: 12, windowMs: 10 * 60_000 })) {
    return;
  }

  const parsed = readJsonBody(req, 2_048);
  if (parsed.error) {
    return res.status(parsed.status).json({ error: parsed.error });
  }
  const body = parsed.body;

  const version = cleanLine(body.version, 64) || "unknown";
  const rating = Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5
    ? body.rating
    : null;
  if (rating === null) return res.status(400).json({ error: "rating must be an integer from 1 to 5" });
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
      body: JSON.stringify({ content, text: content, allowed_mentions: { parse: [] } }),
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

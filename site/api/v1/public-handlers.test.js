import { afterEach, describe, expect, it, vi } from "vitest";
import adReportHandler from "./adreport.js";
import feedbackHandler from "./feedback.js";

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

function post(body, ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`) {
  return { method: "POST", body, headers: { "x-forwarded-for": ip } };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public feedback handlers", () => {
  it("rejects invalid feedback before calling the webhook", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://example.test/hook");
    const webhook = vi.fn();
    vi.stubGlobal("fetch", webhook);
    const res = responseMock();

    await feedbackHandler(post({ version: "0.9.36", rating: 9, beta: false }), res);

    expect(res.statusCode).toBe(400);
    expect(webhook).not.toHaveBeenCalled();
  });

  it("bounds ad ranges and disables Discord mentions", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://example.test/hook");
    const webhook = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", webhook);
    const res = responseMock();

    await adReportHandler(
      post({
        content: "tt1234567",
        source: "ih_deadbeef_0",
        ranges: [{ start: 10, end: 20 }, { start: -1, end: 4 }],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const request = webhook.mock.calls[0][1];
    const payload = JSON.parse(request.body);
    expect(payload.content).toContain("10s–20s");
    expect(payload.content).not.toContain("-1s");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });
});


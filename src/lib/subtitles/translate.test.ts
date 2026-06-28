import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateCues, type TranslateProvider } from "./translate";
import type { SubCue } from "./parser";

type FetchOpts = { shuffle?: boolean; drop?: number[] };

// Build a fake model response from the outgoing user message: echo each ⟦n⟧ line
// with a "TR:" prefix so we can assert the marker→cue mapping. `drop` omits lines,
// `shuffle` reverses them to prove order-independence.
function modelContent(userMsg: string, fopts: FetchOpts): string {
  const lines = userMsg.split("\n").map((line) => {
    const m = /^⟦(\d+)⟧\s(.*)$/.exec(line);
    if (!m) return null;
    return { n: Number(m[1]), out: `⟦${m[1]}⟧ TR:${m[2]}` };
  });
  let kept = lines.filter((l): l is { n: number; out: string } => l !== null);
  if (fopts.drop?.length) kept = kept.filter((l) => !fopts.drop!.includes(l.n));
  if (fopts.shuffle) kept = kept.slice().reverse();
  return kept.map((l) => l.out).join("\n");
}

function openRouterResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  } as unknown as Response;
}

function userMsgFromCall(call: unknown[]): string {
  const init = call[1] as RequestInit;
  const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
  return body.messages[1].content;
}

const OR_PROVIDER: TranslateProvider = { kind: "openrouter", apiKey: "sk-test", model: "" };

function cue(start: number, end: number, text: string): SubCue {
  return { start, end, text };
}

describe("translateCues", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("(a) preserves timing exactly", async () => {
    const cues = [cue(1.2, 3.4, "Hello"), cue(3.4, 5.6, "World")];
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) =>
      openRouterResponse(modelContent(userMsgFromCall([_url, init]), {})),
    );
    const out = await translateCues(cues, "French", OR_PROVIDER);
    expect(out.map((c) => [c.start, c.end])).toEqual([
      [1.2, 3.4],
      [3.4, 5.6],
    ]);
    expect(out[0].text).toBe("TR:Hello");
    expect(out[1].text).toBe("TR:World");
    // original input is not mutated
    expect(cues[0].text).toBe("Hello");
  });

  it("(b) maps by marker even when the model returns lines out of order", async () => {
    const cues = [cue(0, 1, "one"), cue(1, 2, "two"), cue(2, 3, "three")];
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) =>
      openRouterResponse(modelContent(userMsgFromCall([_url, init]), { shuffle: true })),
    );
    const out = await translateCues(cues, "French", OR_PROVIDER);
    expect(out.map((c) => c.text)).toEqual(["TR:one", "TR:two", "TR:three"]);
  });

  it("(c) falls back to the original text when a line is missing", async () => {
    const cues = [cue(0, 1, "keep"), cue(1, 2, "gone"), cue(2, 3, "stay")];
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) =>
      openRouterResponse(modelContent(userMsgFromCall([_url, init]), { drop: [2] })),
    );
    const out = await translateCues(cues, "French", OR_PROVIDER);
    expect(out.map((c) => c.text)).toEqual(["TR:keep", "gone", "TR:stay"]);
  });

  it("(d) respects batchSize (41 cues → 2 requests)", async () => {
    const cues = Array.from({ length: 41 }, (_, i) => cue(i, i + 1, `line ${i}`));
    const spy = (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) =>
      openRouterResponse(modelContent(userMsgFromCall([_url, init]), {})),
    );
    const progress: number[] = [];
    const out = await translateCues(cues, "French", OR_PROVIDER, {
      batchSize: 40,
      onProgress: (done) => progress.push(done),
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([40, 41]);
    expect(out).toHaveLength(41);
    expect(out[40].text).toBe("TR:line 40");
  });

  it("(e) reports a readable error when Ollama is unreachable", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    const ollama: TranslateProvider = {
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
    };
    await expect(translateCues([cue(0, 1, "hi")], "French", ollama)).rejects.toThrow(
      /Cannot reach Ollama at http:\/\/localhost:11434/,
    );
  });

  it("(f) rejects when the abort signal is already aborted", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) => {
      if ((init as RequestInit)?.signal?.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return openRouterResponse(modelContent(userMsgFromCall([_url, init]), {}));
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      translateCues([cue(0, 1, "hi")], "French", OR_PROVIDER, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it("preserves internal line breaks via the ⏎ sentinel", async () => {
    const cues = [cue(0, 2, "first\nsecond")];
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) => {
      const userMsg = userMsgFromCall([_url, init]);
      // the cue must arrive on a single line with the ⏎ marker
      expect(userMsg).toContain("⏎");
      expect(userMsg.split("\n")).toHaveLength(1);
      return openRouterResponse(modelContent(userMsg, {}));
    });
    const out = await translateCues(cues, "French", OR_PROVIDER);
    expect(out[0].text).toBe("TR:first\nsecond");
  });
});

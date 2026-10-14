import { describe, expect, it } from "vitest";
// @ts-expect-error Commit policy script is a Node-only ES module.
import { hasAttribution, stripAttribution } from "../../scripts/attribution.mjs";

const MESSAGE = "fix(player): keep playing\n\nWhy it broke.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n";

describe("attribution policy", () => {
  it("finds an assistant credited in a commit or a pull request", () => {
    expect(hasAttribution(MESSAGE)).toBe(true);
    expect(hasAttribution("Body\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)")).toBe(true);
    expect(hasAttribution("Co-authored-by: Someone <someone@example.com>")).toBe(false);
    expect(hasAttribution("docs: explain the CLAUDE.md pointer")).toBe(false);
  });

  it("removes those lines and keeps the rest of the message", () => {
    expect(stripAttribution(MESSAGE)).toBe("fix(player): keep playing\n\nWhy it broke.\n");
    expect(stripAttribution("feat: x\n\nCo-authored-by: Someone <s@example.com>\n")).toBe(
      "feat: x\n\nCo-authored-by: Someone <s@example.com>\n",
    );
  });
});

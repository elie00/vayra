import { describe, expect, it } from "vitest";
// @ts-expect-error The driver script's helpers are a Node-only ES module.
import { createAppGate, createQueue, planOps, splitOp, swipeArgs } from "../../../scripts/lib/agent-ops.mjs";

describe("agent script", () => {
  it("splits an operation, keeping quoted names whole", () => {
    expect(splitOp('tap "Dune: Part Two"')).toEqual(["tap", "Dune: Part Two"]);
    expect(splitOp("type Rechercher dune part two")).toEqual(["type", "Rechercher", "dune", "part", "two"]);
  });

  it("sends app operations to the app and the rest to the host, refusing unknown ones", () => {
    expect(planOps(["tap Menu", "screenshot /tmp/a.png"])).toEqual([
      { where: "app", op: "tap", args: ["Menu"] },
      { where: "host", op: "screenshot", args: ["/tmp/a.png"] },
    ]);
    expect(() => planOps(["click Menu"])).toThrow(/unknown operation "click"/);
  });

  it("turns a CSS rectangle into device pixels for an adb swipe", () => {
    expect(swipeArgs({ x: 0, y: 500, w: 400, h: 200 }, 2.5, "down", 100)).toEqual(["500", "1500", "500", "1750", "250"]);
    expect(() => swipeArgs({ x: 0, y: 0, w: 1, h: 1 }, 1, "sideways")).toThrow(/down, up, left or right/);
  });

  it("hands a command to a waiting poll, and its reply to the sender", async () => {
    const queue = createQueue();
    const polled = queue.next(1000);
    const result = queue.send("tree", []);
    const command = await polled;
    expect(command).toEqual({ id: 1, op: "tree", args: [] });
    expect(queue.resolve({ id: 1, ok: true, value: [] })).toBe(true);
    await expect(result).resolves.toEqual({ id: 1, ok: true, value: [] });
  });

  it("keeps a command sent before the app polls", async () => {
    const queue = createQueue();
    void queue.send("state", []);
    await expect(queue.next(1000)).resolves.toEqual({ id: 1, op: "state", args: [] });
  });

  it("ends an idle poll with nothing", async () => {
    await expect(createQueue().next(10)).resolves.toBeNull();
  });
});

describe("app identity", () => {
  it("takes the first app that polls, then only that one", () => {
    const gate = createAppGate();
    expect(gate.accept("a")).toBe("new");
    expect(gate.accept("a")).toBe("current");
    expect(gate.connected).toBe(true);
  });

  it("ignores the killed app's late polls after a restart, and waits for the new one", () => {
    const gate = createAppGate();
    gate.accept("old");
    gate.retire();
    expect(gate.connected).toBe(false);
    // A poll still in flight from the app that was just stopped.
    expect(gate.accept("old")).toBe("retired");
    expect(gate.connected).toBe(false);
    expect(gate.accept("fresh")).toBe("new");
    expect(gate.connected).toBe(true);
  });
});

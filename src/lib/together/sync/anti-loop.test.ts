import { describe, expect, it } from "vitest";
import { CorrLru, shouldForward } from "./anti-loop";
import type { CorrId } from "./types";

function corr(member: string, seq: number): CorrId {
  return { member, seq };
}

describe("shouldForward", () => {
  it("never forwards remote-origin actions", () => {
    expect(shouldForward("remote", "local", 1000, 0)).toBe(false);
  });
  it("does not forward while applying a remote command", () => {
    expect(shouldForward("local", "remote", 1000, 0)).toBe(false);
  });
  it("does not forward inside the suppress window", () => {
    expect(shouldForward("local", "local", 500, 1000)).toBe(false);
  });
  it("forwards genuine local action outside suppress window", () => {
    expect(shouldForward("local", "local", 1000, 500)).toBe(true);
  });
});

describe("CorrLru", () => {
  it("dedups a repeated corr", () => {
    const lru = new CorrLru(8);
    expect(lru.add(corr("a", 1))).toBe(true);
    expect(lru.has(corr("a", 1))).toBe(true);
    expect(lru.add(corr("a", 1))).toBe(false);
  });

  it("treats different member/seq as distinct", () => {
    const lru = new CorrLru(8);
    lru.add(corr("a", 1));
    expect(lru.has(corr("a", 2))).toBe(false);
    expect(lru.has(corr("b", 1))).toBe(false);
  });

  it("evicts oldest beyond capacity", () => {
    const lru = new CorrLru(2);
    lru.add(corr("a", 1));
    lru.add(corr("a", 2));
    lru.add(corr("a", 3)); // evicts a:1
    expect(lru.has(corr("a", 1))).toBe(false);
    expect(lru.has(corr("a", 2))).toBe(true);
    expect(lru.has(corr("a", 3))).toBe(true);
    expect(lru.size).toBe(2);
  });

  it("refreshes recency on re-add so it is not evicted first", () => {
    const lru = new CorrLru(2);
    lru.add(corr("a", 1));
    lru.add(corr("a", 2));
    lru.add(corr("a", 1)); // refresh a:1 -> a:2 is now oldest
    lru.add(corr("a", 3)); // evicts a:2
    expect(lru.has(corr("a", 1))).toBe(true);
    expect(lru.has(corr("a", 2))).toBe(false);
    expect(lru.has(corr("a", 3))).toBe(true);
  });
});

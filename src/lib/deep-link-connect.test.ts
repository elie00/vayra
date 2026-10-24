// @vitest-environment jsdom
import { expect, it } from "vitest";
import { emitConnectPair, isConnectPairLink, onConnectPair } from "./deep-link";

const CODE = "vayra://connect/pair#h=192.168.1.85:11472&k=0123&n=MacBook";

it("recognises VAYRA Connect pairing codes only", () => {
  expect(isConnectPairLink(CODE)).toBe(true);
  expect(isConnectPairLink("vayra://connect/pair?h=192.168.1.85:11472&k=0123")).toBe(false);
  expect(isConnectPairLink("vayra://vara/invite#t=VARA0123")).toBe(false);
});

it("keeps a code scanned at cold start for the first listener", () => {
  emitConnectPair(CODE);
  const received: string[] = [];
  const stop = onConnectPair((url) => received.push(url));
  const stopLate = onConnectPair((url) => received.push(`late ${url}`));
  expect(received).toEqual([CODE]);
  stop();
  stopLate();
});

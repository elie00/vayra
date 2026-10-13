import { expect, it, vi } from "vitest";

vi.hoisted(() => { (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "test"; });
vi.mock("@/assets/snip404.svg", () => ({ default: "" }));

const { isNoisyError } = await import("./error-view");

it("keeps connectivity failures off the full-screen error page", () => {
  expect(isNoisyError("error sending request for url (https://v3-cinemeta.strem.io/catalog/movie/top.json)")).toBe(true);
  expect(isNoisyError(new TypeError("Failed to fetch"))).toBe(true);
});

it("still surfaces real application errors", () => {
  expect(isNoisyError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
  expect(isNoisyError("credential write: Value is longer than the platform limit")).toBe(false);
});

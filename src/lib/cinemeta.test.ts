import { expect, it, vi } from "vitest";
import { topMovies } from "./cinemeta";

vi.mock("@/lib/safe-fetch", () => ({
  // The Tauri HTTP plugin rejects with a bare string when the host is unreachable.
  safeFetch: () => Promise.reject("error sending request for url (https://v3-cinemeta.strem.io/catalog/movie/top.json)"),
}));

it("reports an unreachable Cinemeta as a failed catalog instead of rejecting", async () => {
  const diagnostics = { failed: false };
  await expect(topMovies(undefined, 0, diagnostics)).resolves.toEqual([]);
  expect(diagnostics.failed).toBe(true);
});

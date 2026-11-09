import { beforeEach, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: fetchMock }));

import { libraryPut } from "./stremio";

const item = { _id: "tt1234567", name: "Show" } as unknown as Parameters<typeof libraryPut>[1];
const ok = () => ({ json: async () => ({ result: { success: true } }) });
const wait = vi.fn(async (_ms: number) => undefined);

beforeEach(() => {
  fetchMock.mockReset();
  wait.mockClear();
});

it("sends the progress again when the request did not reach Stremio", async () => {
  // 17 October: "put failed send: error sending request" twice during a play; the
  // last put, on leaving the player, has no next tick to catch up.
  fetchMock.mockRejectedValueOnce(new Error("error sending request for url (https://api.strem.io/…)")).mockResolvedValueOnce(ok());
  await libraryPut("key", item, wait);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(2000);
});

it("gives up after two more tries", async () => {
  fetchMock.mockRejectedValue(new Error("error sending request"));
  await expect(libraryPut("key", item, wait)).rejects.toThrow("error sending request");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(wait.mock.calls.map(([ms]) => ms)).toEqual([2000, 5000]);
});

it("does not repeat a request Stremio refused", async () => {
  fetchMock.mockResolvedValue({ json: async () => ({ error: { message: "Session does not exist" } }) });
  await expect(libraryPut("key", item, wait)).rejects.toThrow("Session does not exist");
  expect(fetchMock).toHaveBeenCalledOnce();
});

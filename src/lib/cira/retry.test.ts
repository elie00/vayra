import { expect, it, vi } from "vitest";
import { CiraError, toCiraError } from "./errors";
import { withCiraRetry } from "./retry";

const expired = () => toCiraError({ name: "PostgrestError", code: "PGRST303", message: "JWT expired" });
const offline = () => new TypeError("Load failed");

function deps() {
  return { renewSession: vi.fn(async () => undefined), wait: vi.fn(async (_ms: number) => undefined) };
}

it("renews an expired session once, then tries again", async () => {
  // 17 October: a refresh at launch hit "JWT expired" and Cira stayed in error.
  const d = deps();
  const run = vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce("ok");
  await expect(withCiraRetry(run, d)).resolves.toBe("ok");
  expect(d.renewSession).toHaveBeenCalledOnce();
  expect(run).toHaveBeenCalledTimes(2);
});

it("waits and tries again twice when the network is down", async () => {
  const d = deps();
  const run = vi.fn().mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline()).mockResolvedValueOnce("ok");
  await expect(withCiraRetry(run, d)).resolves.toBe("ok");
  expect(d.wait.mock.calls.map(([ms]) => ms)).toEqual([15_000, 30_000]);
});

it("gives up on other errors, and after its retries", async () => {
  const d = deps();
  await expect(withCiraRetry(vi.fn().mockRejectedValue(new CiraError("RATE_LIMITED")), d)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await expect(withCiraRetry(vi.fn().mockRejectedValue(offline()), d)).rejects.toBeInstanceOf(TypeError);
  await expect(withCiraRetry(vi.fn().mockRejectedValue(expired()), deps())).rejects.toMatchObject({ hint: "PostgrestError PGRST303" });
});

it("stops when the caller is gone", async () => {
  const d = { ...deps(), alive: () => false };
  const run = vi.fn().mockRejectedValue(offline());
  await expect(withCiraRetry(run, d)).rejects.toBeInstanceOf(TypeError);
  expect(run).toHaveBeenCalledOnce();
});

import { CiraError, toCiraError } from "./errors";

/** PostgREST's "JWT expired": the access token lapsed, the refresh token may still work. */
const JWT_EXPIRED = "PGRST303";
const NETWORK_RETRIES_MS = [15_000, 30_000];

function sessionExpired(err: unknown): boolean {
  if (err instanceof CiraError) return err.hint?.split(" ").includes(JWT_EXPIRED) ?? false;
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === JWT_EXPIRED;
}

/**
 * Run a Cira load, and try again when it failed for a passing reason: an expired
 * session is renewed once (Supabase sends the old token when renewing it failed,
 * say the network was down at launch), a network error is retried after 15 then
 * 30 s. Cira used to stay in error until the next launch.
 */
export async function withCiraRetry<T>(
  run: () => Promise<T>,
  deps: { renewSession: () => Promise<void>; wait: (ms: number) => Promise<void>; alive?: () => boolean },
): Promise<T> {
  let renewed = false;
  let networkRetries = 0;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (deps.alive && !deps.alive()) throw err;
      if (!renewed && sessionExpired(err)) {
        renewed = true;
        await deps.renewSession();
        continue;
      }
      if (networkRetries < NETWORK_RETRIES_MS.length && toCiraError(err).code === "NETWORK") {
        await deps.wait(NETWORK_RETRIES_MS[networkRetries]);
        networkRetries += 1;
        continue;
      }
      throw err;
    }
  }
}

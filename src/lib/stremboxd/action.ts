import { safeFetch } from "@/lib/safe-fetch";

export type LetterboxdActionResult =
  | { ok: true }
  | { ok: false; message: string };

type ActionRequest = (url: string) => Promise<Pick<Response, "ok" | "status">>;

const requestAction: ActionRequest = (url) => safeFetch(url);

export async function runLetterboxdAction(
  url: string,
  request: ActionRequest = requestAction,
): Promise<LetterboxdActionResult> {
  try {
    const response = await request(url);
    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : String(error),
    };
  }
}

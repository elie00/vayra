export type SyncActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function runSyncAction(action: () => Promise<unknown>): Promise<SyncActionResult> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : String(error),
    };
  }
}

import { Channel, invoke } from "@tauri-apps/api/core";

export type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number | null;
  ratio: number;
};

export type DownloadHandle = {
  promise: Promise<void>;
  abort: () => void;
};

type DownloadEvent =
  | { kind: "started"; total: number | null; resumed: number }
  | { kind: "progress"; received: number; total: number | null }
  | { kind: "done"; received: number }
  | { kind: "error"; message: string }
  | { kind: "canceled"; received: number };

/**
 * Delete a download's file, and the half-written `.part` next to it. Goes through
 * the backend: the fs plugin is scoped to the app's own folders, so removing a file
 * from the user's download directory is refused there.
 */
export async function removeDownloadFile(destPath: string): Promise<void> {
  await invoke("download_remove_file", { dest: destPath });
}

/** Whether something already sits at this path — same scope reason as above. */
export async function downloadFileExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("download_file_exists", { path });
  } catch {
    return false;
  }
}

export function startDownload(
  id: string,
  url: string,
  destPath: string,
  onProgress: (p: DownloadProgress) => void,
  headers?: Record<string, string>,
  maxBytes?: number,
): DownloadHandle {
  let settle = () => {};
  let fail = (_e: Error) => {};
  const promise = new Promise<void>((res, rej) => {
    settle = res;
    fail = rej;
  });

  const emit = (received: number, total: number | null) =>
    onProgress({
      receivedBytes: received,
      totalBytes: total,
      ratio: total ? Math.min(1, received / total) : 0,
    });

  const channel = new Channel<DownloadEvent>();
  channel.onmessage = (ev) => {
    switch (ev.kind) {
      case "started":
        emit(ev.resumed, ev.total);
        break;
      case "progress":
        emit(ev.received, ev.total);
        break;
      case "done":
        emit(ev.received, ev.received);
        settle();
        break;
      case "canceled": {
        const e = new Error("Download canceled");
        e.name = "AbortError";
        fail(e);
        break;
      }
      case "error":
        fail(new Error(ev.message));
        break;
    }
  };

  invoke("download_start", {
    id,
    url,
    dest: destPath,
    headers: headers && Object.keys(headers).length > 0 ? headers : null,
    maxBytes: maxBytes ?? null,
    onEvent: channel,
  }).catch((e: unknown) => {
    fail(e instanceof Error ? e : new Error(String(e)));
  });

  return {
    promise,
    abort: () => {
      void invoke("download_cancel", { id }).catch(() => {});
    },
  };
}

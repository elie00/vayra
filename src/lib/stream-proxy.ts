import { invoke } from "@tauri-apps/api/core";

export type ProxyResult = {
  sessionId: string;
  url: string;
};

export async function registerStreamProxy(
  url: string,
  headers?: Record<string, string>,
  opts?: { transcode?: boolean },
): Promise<ProxyResult> {
  const args: Record<string, unknown> = { url, headers: headers ?? {} };
  if (opts?.transcode) {
    args.transcode = true;
    args.profile = { force_h264: false, force_aac: false };
  }
  const r = await invoke<{ session_id: string; url: string }>("proxy_register", { args });
  return { sessionId: r.session_id, url: r.url };
}

export async function unregisterStreamProxy(sessionId: string): Promise<void> {
  await invoke("proxy_unregister", { sessionId });
}

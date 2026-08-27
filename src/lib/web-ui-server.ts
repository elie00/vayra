export const WEB_UI_SERVER_ERROR_EVENT = "vayra:web-ui-server-error";

export type WebUiServerErrorDetail = {
  enabled: boolean;
  message: string;
};

export type WebUiServerSyncResult =
  | { ok: true }
  | { ok: false; message: string };

type InvokeCommand = (command: string) => Promise<unknown>;
type InvokeLoader = () => Promise<InvokeCommand>;

const loadInvoke: InvokeLoader = async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  return (command) => invoke(command);
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export async function syncWebUiServer(
  enabled: boolean,
  loader: InvokeLoader = loadInvoke,
): Promise<WebUiServerSyncResult> {
  try {
    const invoke = await loader();
    await invoke(enabled ? "web_serve_start" : "web_serve_stop");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

import { isTauri } from "@tauri-apps/api/core";

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

export async function applyAppIcon(dataUrl: string): Promise<void> {
  if (!dataUrl || !isTauri()) return;
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setIcon(bytes);
  } catch {
    /* set-icon capability ships in the next build */
  }
}

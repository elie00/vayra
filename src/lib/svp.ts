import { invoke } from "@tauri-apps/api/core";

export type SvpStatus = { installed: boolean; ready: boolean };

export async function svpStatus(): Promise<SvpStatus> {
  return invoke<SvpStatus>("svp_status");
}

export async function svpLaunch(): Promise<void> {
  await invoke("svp_launch");
}

export async function svpApply(targetFps: string): Promise<string> {
  return invoke<string>("svp_apply", { targetFps });
}

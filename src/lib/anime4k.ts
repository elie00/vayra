import { invoke } from "@tauri-apps/api/core";

export async function downloadAnime4k(): Promise<string> {
  return invoke<string>("anime4k_download");
}

export async function anime4kDir(): Promise<string | null> {
  return invoke<string | null>("anime4k_dir");
}

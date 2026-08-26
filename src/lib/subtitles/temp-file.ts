import { invoke } from "@tauri-apps/api/core";

export async function writeSubtitleTempFile(
  contents: string,
  extension: "srt" | "vtt",
): Promise<string> {
  return invoke<string>("write_subtitle_temp_file", { extension, contents });
}

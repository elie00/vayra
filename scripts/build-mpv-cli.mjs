import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Builds the bundle's mpv.exe (src-tauri/mpv-cli, a command line over libmpv-2.dll)
// and puts it where tauri.windows.conf.json takes it from. Needs libmpv first:
// `pnpm setup:libmpv`.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const crate = join(root, "src-tauri", "mpv-cli");
const dest = join(root, "src-tauri", "binaries", "mpv-x86_64-pc-windows-msvc.exe");

if (process.platform !== "win32") {
  console.log("[mpv-cli] not Windows, skipping (mac and linux use the system mpv)");
  process.exit(0);
}
if (!existsSync(join(root, "src-tauri", "libmpv", "mpv.lib"))) {
  console.error("[mpv-cli] src-tauri/libmpv/mpv.lib missing");
  process.exit(1);
}

execFileSync("cargo", ["build", "--release", "--manifest-path", join(crate, "Cargo.toml")], {
  stdio: "inherit",
});
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(join(crate, "target", "release", "mpv.exe"), dest);
console.log(`[mpv-cli] wrote ${dest}`);

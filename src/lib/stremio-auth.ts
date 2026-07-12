import { openUrl } from "@/lib/window";

const LOGIN_URL = "https://www.stremio.com/login";
const TIMEOUT_MS = 300000;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function canStremioWebAuth(): boolean {
  return isTauri();
}

export async function startStremioWebAuth(): Promise<string> {
  if (!isTauri()) throw new Error("Signing in through Stremio needs the desktop app.");
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const port = await invoke<number>("stremio_auth_start");
  const callback = `http://127.0.0.1:${port}/cb`;
  const url = `${LOGIN_URL}?appName=${encodeURIComponent("VAYRA")}&appCallback=${encodeURIComponent(callback)}`;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let unlisten: (() => void) | null = null;
    let timer = 0;
    let poll = 0;
    const finish = () => {
      settled = true;
      if (timer) window.clearTimeout(timer);
      if (poll) window.clearInterval(poll);
      document.removeEventListener("visibilitychange", checkPending);
      if (unlisten) unlisten();
    };
    timer = window.setTimeout(() => {
      if (settled) return;
      finish();
      reject(new Error("Timed out waiting for the browser. Try again."));
    }, TIMEOUT_MS);
    void listen<string>("stremio-auth", (e) => {
      if (settled) return;
      const key = typeof e.payload === "string" ? e.payload : "";
      if (!key) return;
      finish();
      resolve(key);
    }).then((fn) => {
      if (settled) fn();
      else unlisten = fn;
    });
    // Sur Android la WebView peut être suspendue pendant que l'utilisateur se
    // connecte dans le navigateur : l'événement peut se perdre. Au retour au
    // premier plan (et en polling de secours), on va rechercher la clé côté Rust.
    const checkPending = () => {
      if (settled || document.visibilityState === "hidden") return;
      void invoke<string | null>("stremio_auth_take_key")
        .then((key) => {
          if (settled || !key) return;
          finish();
          resolve(key);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", checkPending);
    poll = window.setInterval(checkPending, 3000);
    openUrl(url);
  });
}

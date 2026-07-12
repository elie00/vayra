/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __IS_BETA_BUILD__: boolean;

interface ImportMetaEnv {
  readonly VITE_VAYRA_SUPABASE_URL?: string;
  readonly VITE_VAYRA_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __harborStremioDeeplink?: boolean;
  __harborInstallerOpen?: boolean;
}

export const MAL_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
export const MAL_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
export const MAL_API_BASE = "https://api.myanimelist.net/v2";
export const MAL_PIN_REDIRECT_URI = "https://myanimelist.net/v1/oauth2/pin";
export const MAL_DEVELOPER_URL = "https://myanimelist.net/apiconfig";
export const MAL_CLIENT_ID =
  (import.meta.env.VITE_MAL_CLIENT_ID as string | undefined) || "";
export const MAL_CLIENT_SECRET =
  (import.meta.env.VITE_MAL_CLIENT_SECRET as string | undefined) || "";

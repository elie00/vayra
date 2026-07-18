const RELEASE_MANIFEST =
  "https://github.com/elie00/vayra/releases/latest/download/latest.json";
const RELEASE_ASSET_PREFIX =
  "https://github.com/elie00/vayra/releases/download/";

export const fallbackManifest = {
  version: "0.9.36",
  notes: "No signed VAYRA update is currently published.",
  pub_date: "2026-07-18T00:00:00.000Z",
  platforms: {},
};

function isSafeManifest(value) {
  if (!value || typeof value !== "object") return false;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.version ?? "")) {
    return false;
  }
  if (typeof value.pub_date !== "string" || Number.isNaN(Date.parse(value.pub_date))) {
    return false;
  }
  if (!value.platforms || typeof value.platforms !== "object") return false;

  return Object.values(value.platforms).every(
    (entry) =>
      entry &&
      typeof entry.signature === "string" &&
      entry.signature.length > 40 &&
      typeof entry.url === "string" &&
      entry.url.startsWith(RELEASE_ASSET_PREFIX),
  );
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).end();
  }

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  );
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const upstream = await fetch(RELEASE_MANIFEST, {
      redirect: "follow",
      headers: { "User-Agent": "VAYRA-Updater-Manifest/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (upstream.ok) {
      const manifest = await upstream.json();
      if (isSafeManifest(manifest)) {
        return response.status(200).json(manifest);
      }
    }
  } catch {
    // A missing release or a temporary GitHub outage must disable updates,
    // never make the application startup or settings screen fail.
  }

  return response.status(200).json(fallbackManifest);
}

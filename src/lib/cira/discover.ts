import jsQR from "jsqr";
import { requireValidInviteCode } from "./repository";

export const CIRA_DISCOVER_ORIGIN = "https://vayra.eybo.tech";
export const CIRA_DISCOVER_PATH = "/cira/invite";
export const CIRA_QR_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const CIRA_QR_MAX_SOURCE_PIXELS = 24_000_000;
export const CIRA_QR_DECODE_EDGE = 2_048;

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = /\.(?:png|jpe?g|webp)$/i;

export type CiraDiscoverPayload = {
  code: string;
  canonicalUrl: string;
  source: "https" | "deep-link" | "code";
};

export type CiraQrErrorCode =
  | "IMAGE_TYPE_UNSUPPORTED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_DECODE_FAILED"
  | "QR_PAYLOAD_UNAVAILABLE";

export class CiraQrError extends Error {
  readonly code: CiraQrErrorCode;

  constructor(code: CiraQrErrorCode) {
    super(code);
    this.name = "CiraQrError";
    this.code = code;
  }
}

export function formatCiraInviteCode(code: string): string {
  const normalized = requireValidInviteCode(code);
  const secret = normalized.slice(4);
  return `CIRA-${secret.match(/.{4}/g)!.join("-")}`;
}

function strictFragmentCode(url: URL): string | null {
  if (url.search || !url.hash.startsWith("#")) return null;
  const entries = [...new URLSearchParams(url.hash.slice(1)).entries()];
  if (entries.length !== 1 || entries[0][0] !== "t") return null;
  return entries[0][1];
}

/** Parse only intentional CIRA inputs without opening or following a URL. */
export function parseCiraDiscoverPayload(raw: string): CiraDiscoverPayload | null {
  const value = raw.trim();
  if (!value || value.length > 256) return null;

  let rawCode: string | null = null;
  let source: CiraDiscoverPayload["source"] = "code";
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.origin === CIRA_DISCOVER_ORIGIN &&
      url.pathname === CIRA_DISCOVER_PATH &&
      !url.username &&
      !url.password
    ) {
      rawCode = strictFragmentCode(url);
      source = "https";
    } else if (
      url.protocol === "vayra:" &&
      url.hostname === "cira" &&
      url.pathname === "/invite"
    ) {
      rawCode = strictFragmentCode(url);
      source = "deep-link";
    } else {
      return null;
    }
  } catch {
    rawCode = value;
  }

  if (!rawCode) return null;
  try {
    const code = formatCiraInviteCode(rawCode);
    return {
      code,
      canonicalUrl: `${CIRA_DISCOVER_ORIGIN}${CIRA_DISCOVER_PATH}#t=${code}`,
      source,
    };
  } catch {
    return null;
  }
}

export function decodeCiraQrPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): CiraDiscoverPayload | null {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) return null;
  const result = jsQR(pixels, width, height, { inversionAttempts: "attemptBoth" });
  return result?.data ? parseCiraDiscoverPayload(result.data) : null;
}

function imageTypeAllowed(file: File): boolean {
  if (file.type) return ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase());
  return ALLOWED_IMAGE_EXTENSIONS.test(file.name);
}

/** Decode a user-selected image locally. The image and payload never leave the device. */
export async function decodeCiraQrFile(file: File): Promise<CiraDiscoverPayload> {
  if (!imageTypeAllowed(file)) throw new CiraQrError("IMAGE_TYPE_UNSUPPORTED");
  if (file.size <= 0 || file.size > CIRA_QR_MAX_FILE_BYTES) {
    throw new CiraQrError("IMAGE_TOO_LARGE");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new CiraQrError("IMAGE_DECODE_FAILED");
  }

  try {
    if (bitmap.width * bitmap.height > CIRA_QR_MAX_SOURCE_PIXELS) {
      throw new CiraQrError("IMAGE_TOO_LARGE");
    }
    const scale = Math.min(1, CIRA_QR_DECODE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new CiraQrError("IMAGE_DECODE_FAILED");
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const payload = decodeCiraQrPixels(image.data, width, height);
    context.clearRect(0, 0, width, height);
    canvas.width = 1;
    canvas.height = 1;
    if (!payload) throw new CiraQrError("QR_PAYLOAD_UNAVAILABLE");
    return payload;
  } finally {
    bitmap.close();
  }
}

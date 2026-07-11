const LEGACY_SALT = "harbor-profile-v1";
const FORMAT = "pbkdf2-sha256";
const VERSION = "v2";
const ITERATIONS = 310_000;
const SALT_BYTES = 16;

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function fromHex(value: string): Uint8Array | null {
  if (value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function legacyHash(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${LEGACY_SALT}|${password}`);
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

export async function hashProfilePassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await derive(password, salt, ITERATIONS);
  return [FORMAT, VERSION, ITERATIONS, toHex(salt), toHex(digest)].join("$");
}

export type ProfilePasswordVerification = {
  valid: boolean;
  upgradedHash: string | null;
};

export async function verifyAndUpgradeProfilePassword(
  password: string,
  hash: string,
): Promise<ProfilePasswordVerification> {
  if (!hash) return { valid: false, upgradedHash: null };

  if (/^[0-9a-f]{64}$/i.test(hash)) {
    const valid = (await legacyHash(password)) === hash.toLowerCase();
    return {
      valid,
      upgradedHash: valid ? await hashProfilePassword(password) : null,
    };
  }

  const [format, version, rawIterations, rawSalt, rawDigest, ...extra] = hash.split("$");
  if (format !== FORMAT || version !== VERSION || extra.length > 0) {
    return { valid: false, upgradedHash: null };
  }
  const iterations = Number(rawIterations);
  const salt = fromHex(rawSalt);
  const expected = fromHex(rawDigest);
  if (
    iterations !== ITERATIONS ||
    !salt ||
    salt.length !== SALT_BYTES ||
    !expected ||
    expected.length !== 32
  ) {
    return { valid: false, upgradedHash: null };
  }
  const candidate = await derive(password, salt, iterations);
  return { valid: equalBytes(candidate, expected), upgradedHash: null };
}

export async function verifyProfilePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return (await verifyAndUpgradeProfilePassword(password, hash)).valid;
}

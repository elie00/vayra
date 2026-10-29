import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// VAYRA's interface fonts, Sentient (display) and Switzer (text), from
// Fontshare. The app's CSP blocks the Fontshare stylesheet, so each platform
// fell back to its own fonts; they are now embedded in the app instead. The ITF
// Free Font License allows embedding them in an application but not handing
// them out through a public repository, so they are fetched here, verified, and
// kept out of git (public/fonts/fontshare/ is ignored). Without them the app
// still renders with the fallback fonts.

const FONTS = [
  {
    file: "Sentient-Variable.woff2",
    url: "https://cdn.fontshare.com/wf/NY2ZL3ZVCWEGOL6C3UVCNGYW5UU4EWVZ/E62VQS3OCYTBL5HEKIEGN3RTBX7KFK6F/NZPIPWPM74OTNMX6CKNACLBKCGJLJEBU.woff2",
    sha256: "e0c1b99d18c29a3e3b68fbfdbea85419ae1788cd0f5f6aca3398d1a70de968d9",
  },
  {
    file: "Switzer-Variable.woff2",
    url: "https://cdn.fontshare.com/wf/HJHZ26OECMTXRH7JXPFC7EVIHDSLT2RA/LJRNLR7WCPF3PY3SZ7B2LHNUTQMFNCHL/4MCJYGQDIOOXHWSIIB2OYNDBEALJSOGN.woff2",
    sha256: "d1bf801ffb1a6096def70a7c532255722ad87d948b13a8a586e342f7091f8ee4",
  },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "fonts", "fontshare");
const digest = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(dest, { recursive: true });
for (const f of FONTS) {
  const out = join(dest, f.file);
  if (existsSync(out) && digest(readFileSync(out)) === f.sha256) {
    console.log(`[ui-fonts] ${f.file} already present and verified`);
    continue;
  }
  console.log(`[ui-fonts] fetching ${f.file}`);
  const res = await fetch(f.url, { redirect: "follow" });
  if (!res.ok) {
    console.error(`[ui-fonts] download failed (${res.status} ${res.statusText}) for ${f.file}`);
    console.error("[ui-fonts] download it from fontshare.com and drop it into public/fonts/fontshare/");
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const got = digest(buf);
  if (got !== f.sha256) {
    console.error(`[ui-fonts] checksum mismatch for ${f.file} (expected ${f.sha256}, got ${got})`);
    process.exit(1);
  }
  writeFileSync(out, buf);
  console.log(`[ui-fonts] wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

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
  {
    file: "GeneralSans-400.woff2",
    url: "https://cdn.fontshare.com/wf/MFQT7HFGCR2L5ULQTW6YXYZXXHMPKLJ3/YWQ244D6TACUX5JBKATPOW5I5MGJ3G73/7YY3ZAAE3TRV2LANYOLXNHTPHLXVWTKH.woff2",
    sha256: "3ec2be771caf168b077ca05af4df1dace77088e2b3a27da570036e61be58a039",
  },
  {
    file: "GeneralSans-500.woff2",
    url: "https://cdn.fontshare.com/wf/3RZHWSNONLLWJK3RLPEKUZOMM56GO4LJ/BPDRY7AHVI3MCDXXVXTQQ76H3UXA63S3/SB2OEB6IKZPRR6JT4GFJ2TFT6HBB6AZN.woff2",
    sha256: "c30377df1de8444d07161725c751f458beec07c28034df2fd275d1aa587a239f",
  },
  {
    file: "GeneralSans-600.woff2",
    url: "https://cdn.fontshare.com/wf/K46YRH762FH3QJ25IQM3VAXAKCHEXXW4/ISLWQPUZHZF33LRIOTBMFOJL57GBGQ4B/3ZLMEXZEQPLTEPMHTQDAUXP5ZZXCZAEN.woff2",
    sha256: "94a2a0e1ef59728eb65498ed7fe26e5af7e2858a3a4a278a89ac1f83a0544945",
  },
  {
    file: "GeneralSans-700.woff2",
    url: "https://cdn.fontshare.com/wf/KWXO5X3YW4X7OLUMPO4X24HQJGJU7E2Q/VOWUQZS3YLP66ZHPTXAFSH6YACY4WJHT/NIQ54PVBBIWVK3PFSOIOUJSXIJ5WTNDP.woff2",
    sha256: "a29eab9b114f3c631cb24d537400dfb8d0ceea8cc9fb514864a68c4ead960490",
  },
  {
    file: "CabinetGrotesk-400.woff2",
    url: "https://cdn.fontshare.com/wf/J6PPRPKWXDUIYA47IXLEQB4R4OPVYDQH/N2ZXAXWEHVMLISD2TIXJC7EF4GOY43L4/NXM4Z4TDCMYWBZ7AVI2N6DQ5VMWNENMU.woff2",
    sha256: "90ef3ec3532a1ba9c6809fe97bb991d90fa0466e56697ba28370209410fd7e3d",
  },
  {
    file: "CabinetGrotesk-500.woff2",
    url: "https://cdn.fontshare.com/wf/CKQBK2QBTCDREE7L3MXZ3PPW7LDNJCWU/OTOY7FQFSFOJVZKJWKO2EHUJLOGBDN4Q/4CO2ETY7NITKLUDKMYJ75RHJSPHOJ7XT.woff2",
    sha256: "b641ecaaeda27cf0d560bf26058e9bc9997ac7bfdc58414f9df2d4d58a32c34b",
  },
  {
    file: "CabinetGrotesk-700.woff2",
    url: "https://cdn.fontshare.com/wf/XMXWOHABYLQDJ42L65EFRYNVRY37HQCB/B2O4O6V3JMFM2WDCYQI3A47L5U4THDUL/WN5274VQ3AUBDFP74GB4EC4XYJ3EKVNE.woff2",
    sha256: "52208453fddad17efb2ec2d98729e18556d6c5b64ad22171f8e8b071802314d3",
  },
  {
    file: "CabinetGrotesk-800.woff2",
    url: "https://cdn.fontshare.com/wf/ZX6AQLSFYVDPN2URWO2MQFGTYYOHIS64/TPYPKOYWFQVNJHLLRXD4KFYX4LUOUW4Z/6QH2ALVTTK7IRVO5MYOQQ3OZNXW5SSS3.woff2",
    sha256: "694b9d04bb9fe15a79242a653a8f6de8296d7b32c5706a9f7275523889973884",
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

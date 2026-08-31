#!/usr/bin/env node
// Grant or revoke CIRA/VARA beta access for one account.
//
// Every CIRA and VARA RPC goes through private.cira_require_uid(), which raises
// BETA_ACCESS_REQUIRED unless the caller carries app_metadata.cira_beta = true.
// A signup does not set it — nothing does automatically — so a new tester can
// sign in and still be turned away from friends, presence and watch rooms.
//
// Usage:
//   node scripts/cira/beta-access.mjs list
//   node scripts/cira/beta-access.mjs grant  someone@example.com
//   node scripts/cira/beta-access.mjs revoke someone@example.com
//
// Needs SUPABASE_ACCESS_TOKEN, or the Supabase CLI logged in on macOS, and
// SUPABASE_PROJECT_REF (defaults to the VAYRA project).

import { execFileSync } from "node:child_process";

const PROJECT = process.env.SUPABASE_PROJECT_REF ?? "kbuwutnzqapwnvzgyjtw";

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
      encoding: "utf8",
    }).trim();
  } catch {
    console.error("No SUPABASE_ACCESS_TOKEN, and the Supabase CLI keychain entry was not readable.");
    console.error("Run `supabase login`, or export SUPABASE_ACCESS_TOKEN.");
    process.exit(1);
  }
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`Query failed (HTTP ${res.status}):`, body);
    process.exit(1);
  }
  return body;
}

// Single-quote escaping is enough here: the only interpolated value is an email
// address, and it is compared as a literal.
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;

async function list() {
  const rows = await query(
    `select email,
            coalesce(raw_app_meta_data ->> 'cira_beta', 'false') as beta,
            to_char(created_at, 'YYYY-MM-DD') as created
       from auth.users
      order by created_at`,
  );
  if (rows.length === 0) {
    console.log("No accounts yet.");
    return;
  }
  for (const r of rows) {
    console.log(`${r.beta === "true" ? "beta " : "  -  "} ${r.email}  (${r.created})`);
  }
  console.log(`\n${rows.filter((r) => r.beta === "true").length} of ${rows.length} with beta access.`);
}

async function setAccess(email, enabled) {
  const found = await query(`select id from auth.users where email = ${lit(email)}`);
  if (found.length === 0) {
    console.error(`No account for ${email}. They have to sign up first.`);
    process.exit(1);
  }
  await query(
    `update auth.users
        set raw_app_meta_data =
              coalesce(raw_app_meta_data, '{}'::jsonb) || ${lit(JSON.stringify({ cira_beta: enabled }))}::jsonb
      where email = ${lit(email)}`,
  );
  const after = await query(
    `select coalesce(raw_app_meta_data ->> 'cira_beta', 'false') as beta
       from auth.users where email = ${lit(email)}`,
  );
  const now = after[0]?.beta === "true";
  if (now !== enabled) {
    console.error(`Expected beta access ${enabled} for ${email}, database says ${now}.`);
    process.exit(1);
  }
  console.log(`${email}: beta access ${enabled ? "granted" : "revoked"}.`);
  console.log("They must sign out and back in — the flag rides in the JWT.");
}

const [action, email] = process.argv.slice(2);
if (action === "list") await list();
else if ((action === "grant" || action === "revoke") && email) {
  await setAccess(email, action === "grant");
} else {
  console.error("Usage: beta-access.mjs list | grant <email> | revoke <email>");
  process.exit(1);
}

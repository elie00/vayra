#!/usr/bin/env node
// What the beta testers are actually managing to do.
//
// Reads the state that persists — accounts, sessions, CIRA/VARA rows — plus any
// errors still inside the log retention window. Log retention is short, so run
// this during or shortly after a test session to catch failures; the account and
// activity picture stays accurate whenever you run it.
//
// Usage: node scripts/cira/beta-watch.mjs
//
// Needs SUPABASE_ACCESS_TOKEN, or the Supabase CLI logged in on macOS.

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
    process.exit(1);
  }
}

const TOKEN = accessToken();

// The management API rate-limits bursts, so requests are spaced and the whole
// account picture is fetched in one statement rather than several.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error(`Query failed (HTTP ${res.status})`);
    return null;
  }
  return res.json();
}

async function logs(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body.result ?? [];
}

const accounts = await query(`
  select email,
         coalesce(raw_app_meta_data ->> 'cira_beta', 'false') as beta,
         email_confirmed_at is not null as confirmed,
         to_char(last_sign_in_at, 'MM-DD HH24:MI') as last_sign_in,
         (select count(*) from auth.sessions s where s.user_id = u.id) as sessions
    from auth.users u
   order by created_at
`);

console.log("COMPTES");
for (const a of accounts ?? []) {
  const flags = [
    a.beta === "true" ? "beta" : "PAS DE BETA",
    a.confirmed ? null : "ADRESSE NON CONFIRMEE",
    a.last_sign_in ? null : "JAMAIS CONNECTE",
  ].filter(Boolean);
  console.log(`  ${a.email.padEnd(28)} ${String(a.sessions).padStart(2)} session(s)  ${flags.join(", ")}`);
}

await wait(1500);

const activity = await query(`
  select (select count(*) from public.cira_profiles)    as profils,
         (select count(*) from public.cira_friendships) as amities,
         (select count(*) from public.cira_invitations) as invitations,
         (select count(*) from public.vara_rooms)       as salles,
         (select count(*) from public.vara_collections) as collections
`);

console.log("\nACTIVITÉ");
for (const [k, v] of Object.entries(activity?.[0] ?? {})) {
  console.log(`  ${k.padEnd(14)} ${v}`);
}

// A tester who signed in but never created a profile cannot use anything social:
// every direct invitation answers PROFILE_REQUIRED until they pick a handle.
const stuck = (accounts ?? []).filter((a) => a.last_sign_in && a.beta === "true");
if (stuck.length > 0 && (activity?.[0]?.profils ?? 0) === 0) {
  console.log("\n  → connectés avec l'accès bêta mais aucun profil CIRA choisi :");
  console.log("    tout ce qui est social leur répondra PROFILE_REQUIRED.");
}

console.log("\nERREURS RÉCENTES (fenêtre de rétention des logs)");
const errors = await logs(`
  select cast(t.timestamp as datetime) as at, event_message
  from postgres_logs t
  where event_message like '%BETA_ACCESS_REQUIRED%'
     or event_message like '%NOT_AUTHENTICATED%'
     or event_message like '%PROFILE_REQUIRED%'
     or event_message like '%ERROR%'
  order by t.timestamp desc limit 15
`);
if (errors.length === 0) console.log("  aucune — soit tout va bien, soit rien ne s'est passé depuis peu");
for (const e of errors) console.log(`  ${e.at}  ${String(e.event_message).slice(0, 120)}`);

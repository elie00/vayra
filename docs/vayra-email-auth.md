# VAYRA email authentication

VAYRA supports two distinct account paths:

1. a VAYRA account authenticated by a passwordless email link;
2. an optional Stremio connection for the Stremio library, progress, and addons.

The two sessions are intentionally independent. Connecting or disconnecting one
does not change the other.

## Production project

The production client is connected to the EYBO-owned Supabase project `VAYRA`
in `eu-west-3` (Paris). The project URL and default publishable key are embedded
in the frontend because publishable keys are explicitly designed for public
clients. No secret or `service_role` key is present in the application.

Email sign-up is enabled with mandatory email confirmation. Anonymous sign-in,
phone sign-in, manual identity linking, and every social provider are disabled.
Both the Site URL and redirect allow-list use `vayra://auth/callback`.

## Production email delivery

Authentication email is delivered through a dedicated Resend SMTP integration.
The verified sending domain is `mail.eybo.tech` and the visible sender is
`VAYRA <auth@mail.eybo.tech>`. SPF, DKIM, and a monitoring-only DMARC policy are
published in the Vercel-managed DNS zone for `eybo.tech`.

The SMTP credential is restricted to sending from `mail.eybo.tech`. It is held
by Resend and encrypted by Supabase; it must never be added to this repository.
Supabase enforces a 60-second minimum interval per recipient and starts custom
SMTP projects at its production email rate limit.

The hosted Supabase templates are mirrored in the repository so branding can be
reviewed and restored without storing infrastructure secrets:

- `supabase/templates/confirm-signup.html` for a new passwordless account;
- `supabase/templates/magic-link.html` for an existing account.

Both templates intentionally avoid remote images and tracking links. They use
the VAYRA obsidian, violet, blue, and ivory palette with the signature
“A product by EYBO”.

## Optional runtime override

For local or staging tests, copy `.env.example` to `.env.local` and override the
public settings:

```dotenv
VITE_VAYRA_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_VAYRA_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Only the public anonymous/publishable key belongs in the client. A service-role
key, SMTP password, or provider secret must never be stored in this repository
or exposed through a `VITE_*` variable.

For an override project, configure the Supabase dashboard as follows:

1. enable the Email provider and passwordless email sign-in;
2. add `vayra://auth/callback` to the allowed redirect URLs;
3. configure the sender identity and email template for EYBO/VAYRA;
4. keep Google, Apple, Microsoft, and every other social provider disabled.

The application uses PKCE. The email link must therefore be opened on the same
device and VAYRA installation that requested it, because that installation owns
the verifier required to exchange the callback code.

## Session storage

Desktop and Android builds store the Supabase session through the existing
`auth_secret_read` / `auth_secret_write` commands under dedicated account names
prefixed by `vayra-email-session-v1:`. The Supabase session and the temporary
PKCE verifier remain separate entries. Desktop uses the operating-system keyring and
Android uses the existing Keystore-backed credential bridge. Browser builds use
separate local-storage keys prefixed by `vayra.email.session.v1:`.

The existing Stremio session remains profile-scoped and is not migrated,
overwritten, or used as the VAYRA identity.

## Manual validation

Run this test on each packaged platform after configuring a real project:

1. open **Settings → Account → VAYRA account**;
2. request a link for a new email address;
3. open the received link on the same device;
4. confirm that VAYRA returns to the foreground and shows the email as connected;
5. restart VAYRA and confirm the session is restored;
6. connect and disconnect Stremio, confirming the VAYRA session remains active;
7. sign out of VAYRA, confirming the Stremio session remains active.

Production delivery, the sender domain, and the redirect allow-list are
configured. The full email-to-app callback still requires a manual test with an
explicitly authorized recipient on each packaged platform.

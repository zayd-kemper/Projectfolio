# Deployment

## Supabase Auth — one-time dashboard setup

Do all of this **before** deploying the code that expects it. Steps 1–5 are safe to
perform ahead of time: they change nothing for the currently-deployed login system.

Replace `<project-ref>` with your Supabase project ref (currently
`dhzhtigowbvlmcrwvwix`), `<app-domain>` with the production frontend origin, and
`<api-domain>` with the production API origin.

### 1. Email provider

Authentication → Providers → **Email**

- Enable email provider: **ON**
- Confirm email: **ON**
- Minimum password length: **8** (matches the app's client-side check)

Authentication → Emails → **SMTP Settings**

- Configure custom SMTP. Supabase's built-in sender is rate-limited to a few
  messages per hour and is not usable for real signups. You can reuse the same
  credentials as `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASSWORD` in the backend env.

### 2. URL configuration

Authentication → **URL Configuration**

- Site URL: `https://<app-domain>`
- Redirect URLs — add every one of these:
  - `https://<app-domain>/auth/callback`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:5173/auth/callback`

Every `redirectTo` the app sends is `<origin>/auth/callback` — used by OAuth, the
email-confirmation link, and the password-recovery link. A missing entry here makes
OAuth fail with `redirect_to is not allowed` **after** the user has already
authorized at the provider, which is the most confusing failure mode in this
migration.

### 3. Social providers

Authentication → Providers. For each of Google, GitHub, and LinkedIn (OIDC), enable
it and paste the client ID/secret from the app's existing OAuth apps (previously
`GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `LINKEDIN_CLIENT_ID` in the backend `.env`).

Then, in each provider's own console, add the Supabase callback to the allowed
redirect URIs — **in addition to**, not instead of, the app's existing callback, so
a rollback still works:

| Provider | Console | Add this redirect URI |
|---|---|---|
| Google | console.cloud.google.com → Credentials → OAuth 2.0 Client | `https://<project-ref>.supabase.co/auth/v1/callback` |
| GitHub | github.com/settings/developers → OAuth Apps | `https://<project-ref>.supabase.co/auth/v1/callback` |
| LinkedIn | linkedin.com/developers → App → Auth | `https://<project-ref>.supabase.co/auth/v1/callback` |

LinkedIn must have the **Sign In with LinkedIn using OpenID Connect** product
enabled, with the `openid`, `profile`, and `email` scopes. Supabase's slug for it is
`linkedin_oidc`.

### 4. Environment variables

Backend deployment:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable or anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
ANALYTICS_VISITOR_SECRET=<independent random secret>
```

Frontend build:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
```

Both keys are under Project Settings → API. The **publishable/anon** key is public
and ships in the JS bundle; the **service role** key is server-side only and bypasses
RLS. `ANALYTICS_VISITOR_SECRET` is now a hard production boot requirement — it used
to fall back to `JWT_SECRET`, which no longer exists.

You may leave `JWT_SECRET` / `SESSION_SECRET` set during the rollback window. Nothing
reads them, and keeping them means a code revert boots without an env change.

### 5. Verify the project's JWT signing mode

```bash
curl -s https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
```

This must return a JSON object with a **non-empty** `keys` array. If it returns
`{"keys":[]}` the project is still on legacy HS256 signing, and
`backend/utils/supabaseJwt.js` (JWKS-only by design) will reject every token —
migrate the project to asymmetric keys under Project Settings → JWT Keys first.

---

## Cutover

### 6. Apply the migrations

```bash
cd backend
npm run db:migrate
```

Expected: `Migration applied` for `011_supabase_auth_trigger.sql` (the profile
provisioning + email sync triggers) and `012_supabase_auth_import.sql` (the identity
import plus the `users.id → auth.users(id)` foreign key).

The deploy role must be `postgres`, which holds `TRIGGER`, `INSERT`, and `REFERENCES`
on `auth.users`. If `012` fails with `permission denied` (`42501`), apply `011` and
`012` through the Supabase SQL editor instead, then insert their filenames and
checksums into `schema_migrations` manually so the runner does not retry them.

`012` is transactional and idempotent. The foreign key at the end is the verification
step: if any profile failed to import, `ADD CONSTRAINT` fails and the whole migration
rolls back rather than leaving a half-migrated database.

### Pre-cutover: confirm migrations applied cleanly

Some migrations use `CREATE INDEX CONCURRENTLY`, which can fail with a Postgres
ownership error (`42501`) under a non-owner role. That failure is recorded in
`schema_migration_warnings` rather than failing the deploy, so it is silent.

`idx_discover_events_user_type_created` (migration 006) is the covering index that
keeps the Discover recommendation query cheap. If it is missing, Discover degrades
badly under load.

Before sending production traffic, confirm both:

1. `GET /health/ready` reports `ready`, not `ready_with_warnings`
2. `SELECT COUNT(*) FROM schema_migration_warnings;` returns 0

If either check fails, run `npm run db:retry-warnings` with an owner-level
`MIGRATION_DATABASE_URL` and re-check.

### 7. Verify the import

```sql
SELECT
  (SELECT count(*) FROM public.users)                                  AS profiles,
  (SELECT count(*) FROM auth.users)                                    AS auth_users,
  (SELECT count(*) FROM public.users u
     LEFT JOIN auth.users a ON a.id = u.id WHERE a.id IS NULL)         AS unimported,
  (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL)   AS unconfirmed,
  (SELECT count(*) FROM auth.users
     WHERE confirmation_token IS NULL OR recovery_token IS NULL
        OR email_change IS NULL OR email_change_token_new IS NULL
        OR email_change_token_current IS NULL OR phone_change IS NULL
        OR phone_change_token IS NULL OR reauthentication_token IS NULL) AS null_string_rows,
  (SELECT count(*) FROM auth.identities WHERE provider = 'email')      AS email_identities,
  (SELECT count(*) FROM auth.identities WHERE provider <> 'email')     AS social_identities,
  (SELECT count(*) FROM pg_trigger
     WHERE tgname IN ('on_auth_user_created','on_auth_user_email_sync')) AS triggers,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'users_id_fkey') AS fk;
```

Required, against the pre-migration counts recorded on 2026-07-24:

- `profiles = auth_users = 79`
- `unimported = 0`
- `unconfirmed = 0`
- **`null_string_rows = 0`** — anything else means logins will 500. `auth.users` has
  eight columns that are nullable in the DDL but which GoTrue scans into
  non-nullable Go strings. Fix with
  `UPDATE auth.users SET confirmation_token = COALESCE(confirmation_token,''), …`
  for all eight before continuing.
- `email_identities = 78`, `social_identities = 4`
- `triggers = 2`, `fk = 1`

### 8. Deploy backend and frontend together

They must ship in the same window. The backend stops accepting legacy JWTs and the
frontend stops issuing them; either one alone signs everybody out with no way back
in. All logged-in users are signed out once. Passwords are preserved, so re-login is
seamless.

```bash
curl -s https://<api-domain>/health/ready
```

Expected: `"status":"ready"` (or `ready_with_warnings`) **and** `"auth_triggers":2`.
A 503 mentioning missing triggers means step 6 did not take.

### 9. Verify the live flows

1. **Migrated user, original password** — sign in with a pre-existing account using
   the password it had before the migration. Should land on `/dashboard`, and
   `GET /api/auth/me` should return the same `id` and `username` as before. *This is
   the single most important check in the migration.*
2. **Wrong password** — stays on `/login`, error shown, no session.
3. **New signup** — register a fresh address, see the "Check your email" state,
   confirm the address, sign in, `/dashboard` loads.
4. **Profile provisioning** — for that new user, `public.users` has exactly one row
   with the new `auth.users` id, `username` is a sane lowercase slug (not an
   uppercase-stripped mangling), and a `portfolio_settings` row exists.
5. **Unconfirmed account is refused** — register a second address, do not confirm,
   attempt sign-in, expect Supabase's "Email not confirmed".
6. **Bad token is refused** —
   `curl -H "Authorization: Bearer not-a-token" https://<api-domain>/api/auth/me`
   returns 401 `AUTH_REQUIRED`.
7. **Sign out** — an authed page redirects to `/login` and the Supabase session key
   is gone from `localStorage`.
8. **Password reset** — `/forgot-password` → email → link → `/reset-password` → set
   a new password → signed in.
9. **Each provider button** navigates to that provider's real authorization host
   (`accounts.google.com`, `www.linkedin.com`, `github.com`) with a `redirect_uri`
   pointing at `https://<project-ref>.supabase.co/auth/v1/callback`.
10. **Real provider round-trip** (manual — completing a real credential flow is not
    reliably automatable and is against provider automation policy). For each of
    Google, LinkedIn, and GitHub: click the button, complete the real consent
    screen, confirm you land on `/dashboard` signed in.
11. **Identity re-linking** (manual, and the check that proves the import worked) —
    sign in with Google using the account behind one of the two pre-existing
    `google_id` rows. It must land on the **existing** profile: same username, same
    projects. Repeat for one `linkedin_id` row. A brand-new empty profile here means
    the `auth.identities` import did not match, and you should roll back rather than
    proceed to the cleanup migration.

### 10. Soak, then clean up

Leave the system on the retained legacy columns for at least one full business day of
real traffic, then apply the destructive cleanup:

```bash
cd backend
npm run db:migrate    # applies 013_supabase_auth_cleanup.sql
npm uninstall bcryptjs
```

`013` drops `auth_refresh_tokens`, `users.password_hash`, and `users.token_version`.
`google_id` / `github_id` / `linkedin_id` are deliberately kept as the audit trail for
the import.

---

## Rollback

**Before the cleanup migration:** revert the code deploy on both backend and
frontend. `password_hash`, `token_version`, and `auth_refresh_tokens` are all still
present, `JWT_SECRET`/`SESSION_SECRET` are still set, and the provider consoles still
list the app's own callback URLs, so the old system comes back intact. The
`auth.users` rows and the `users_id_fkey` constraint are harmless to leave in place —
nothing in the old code path reads them. Users are signed out once and log back in
with the same passwords.

**After the cleanup migration:** rollback requires restoring `public.users` from a
Supabase backup (Database → Backups) to recover `password_hash` and `token_version`,
plus recreating `auth_refresh_tokens` from `001_scalability_schema.sql`. Treat this as
a real incident, not a redeploy — which is the reason for the soak period.

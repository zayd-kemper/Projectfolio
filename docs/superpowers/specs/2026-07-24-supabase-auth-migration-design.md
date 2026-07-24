# Supabase Auth Migration — Design

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Scope:** Replace the hand-rolled email/password + Passport OAuth system with Supabase Auth (GoTrue) as the identity provider and token issuer, for email/password and three social providers (Google, GitHub, LinkedIn).

---

## 1. Goals & non-goals

**Goals**
- Email/password registration and login run through Supabase Auth.
- Google, GitHub, and LinkedIn (OIDC) social login run through Supabase Auth.
- Existing accounts are preserved: same user id, same password, same linked social identities — no forced re-registration.
- Fully functional at a deployment level (production redirect URLs, provider config, email confirmation, session refresh).
- Automated Playwright coverage of the email/password path; documented manual verification for real social round-trips.

**Non-goals**
- No migration to RLS-enforced, client-direct data access. The backend stays a service-role BFF (Backend-For-Frontend). RLS remains deny-all; the backend reaches the database with service credentials and is the only data path for the SPA.
- No change to application routes' business logic. Only *who the authenticated user is* and *how that is proven* changes.

---

## 2. Chosen architecture — BFF, identity-only

Supabase Auth becomes the source of truth for credentials, sessions, refresh, and OAuth. The existing application `users` table is demoted to a **profile** table linked 1:1 to `auth.users`.

- `users.id` is set equal to `auth.users.id` (same uuid). A foreign key `users.id → auth.users(id) ON DELETE CASCADE` enforces the link.
- Because `users.id` values are unchanged, every existing foreign key that references `users.id` (`projects.user_id`, `portfolio_settings.user_id`, `background_jobs.user_id`, endorsements, teams, etc.) keeps working with **no data remap**.
- The backend continues to read/write all application tables through the pg pool with service credentials, so RLS deny-all is unaffected and no per-route rewrite is required.
- `req.user.id` is now the Supabase JWT `sub` claim (the auth uid), which equals the profile `users.id`.

### Why not full Supabase-native (RLS)
Rejected as out of scope: it would require rewriting every table with RLS policies keyed to `auth.uid()`, moving data reads to the client via `supabase-js`, and retiring most of the backend — a far larger, higher-risk change with no requirement driving it. The BFF approach reaches "auth fully through Supabase" with minimal blast radius.

---

## 3. Identity & data migration (preserve existing users)

A new numbered SQL migration performs a one-time import. It must run against the Supabase project (service role / SQL editor privileges on the `auth` schema).

### 3.1 Password users
For each `users` row with a non-null `password_hash`, insert a corresponding `auth.users` row:
- `id` = existing `users.id` (preserves the FK graph)
- `email` = `users.email`
- `encrypted_password` = `users.password_hash`
  - bcryptjs produces `$2a$`/`$2b$` bcrypt hashes; GoTrue verifies bcrypt, so existing passwords keep working unchanged.
- `email_confirmed_at` = `now()` when `is_email_verified` is true (or unconditionally for existing accounts, so migrated users are not locked out by the new confirm-email gate), plus the required GoTrue bookkeeping columns (`aud`, `role`, `instance_id`, timestamps, `raw_app_meta_data`, `raw_user_meta_data` carrying `full_name`/`username`/`avatar_url`).

### 3.2 Social identities
For each `google_id` / `github_id` / `linkedin_id` present on a `users` row, insert an `auth.identities` row (`provider`, `provider_id`, `user_id`, `identity_data`) so that a future social login re-links to the **same** account rather than creating a duplicate. This covers both OAuth-only accounts (null password) and password accounts that had also linked a provider.

### 3.3 Ordering & safety
- Keep `users.password_hash`, `users.token_version`, and the `auth_refresh_tokens` table in place until the import is verified in the target environment.
- The import is idempotent (guarded by `WHERE NOT EXISTS` on `auth.users`) so it can be re-run.
- A verification step (row counts match, sample login succeeds) precedes the cleanup migration.

### 3.4 New-user profile creation (DB trigger)
A `handle_new_user()` trigger on `auth.users` `AFTER INSERT` creates the downstream rows for every future signup regardless of path (email or any social provider):
- Insert into `users` with `id = NEW.id`, `email = NEW.email`, `full_name`/`avatar_url` from `NEW.raw_user_meta_data`, and a unique `username` (derived from metadata/email, deduped with a numeric suffix on collision).
- Insert the default `portfolio_settings` row.
- `SECURITY DEFINER`, owned by a role that can write the `public` schema.

This replaces the per-strategy "create user + create portfolio_settings" logic currently duplicated across `routes/auth.js` and `config/passport.js`.

---

## 4. Backend changes

### 4.1 Rewrite `middleware/auth.js`
- Verify the incoming bearer token as a **Supabase JWT**:
  - Primary: asymmetric verification via JWKS using `jose`'s `createRemoteJWKSet` against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (Supabase's current default signing).
  - Fallback: HS256 via `SUPABASE_JWT_SECRET` for projects still on the legacy shared secret.
- On success: `req.user = { id: payload.sub, email: payload.email, ... }`. Downstream routes that only use `req.user.id` are unaffected.
- Remove `tokenVersion` freshness checks; Supabase owns session revocation and refresh. `optionalAuth` keeps the same shape (verify if present, ignore on failure).
- Profile fields beyond id/email that routes expect on `req.user` (e.g. `username`) are read from the `users` table when needed rather than trusted from the token, or included via a lightweight lookup — resolved in the implementation plan.

### 4.2 Trim `routes/auth.js`
- **Delete** handlers now owned by Supabase: `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `PUT /change-password`, `PUT /change-email`.
- **Keep** `GET /me` (joins profile + portfolio settings) and `PUT /profile` (profile edits), both behind the new `requireAuth`.

### 4.3 Delete obsolete modules
- `config/passport.js`, `routes/oauth.js`, `utils/tokens.js`, `utils/authTokenVersion.js`.
- In `server.js`: remove passport initialize/session middleware, the OAuth router mount, and the session store wiring that existed solely for the OAuth login flow. Audit whether `express-session`/`connect-redis` are still needed elsewhere; drop if not.

### 4.4 Schema cleanup migration (after cutover verified)
- Drop `auth_refresh_tokens`.
- Drop `users.password_hash`, `users.token_version`.
- Add the `users.id → auth.users(id)` foreign key.

### 4.5 New dependencies / env
- Backend deps: `jose` (JWT/JWKS verify), `@supabase/supabase-js` (admin client for the import script + any admin operations).
- Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`. Update `.env.example` and the production boot checks (the server already refuses to boot in production without required secrets — extend that list).

---

## 5. Frontend changes

### 5.1 Client
- Add `@supabase/supabase-js`; create `frontend/src/lib/supabase.js` exporting a configured client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), with session persistence + auto-refresh enabled.
- Give `@supabase/supabase-js` its own manual vendor chunk in `vite.config.js`.

### 5.2 Pages / hooks
- `RegisterPage.jsx`: `supabase.auth.signUp({ email, password, options: { data: { full_name, username } } })`; show a "check your email to confirm" state.
- `LoginPage.jsx`: `supabase.auth.signInWithPassword`; three provider buttons calling `supabase.auth.signInWithOAuth({ provider: 'google' | 'github' | 'linkedin_oidc', options: { redirectTo } })`.
- `useAuth.jsx`: back it with `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange()`; expose `user`, `session`, `signOut`.
- `utils/api.js`: attach `Authorization: Bearer ${session.access_token}` from the current Supabase session; remove the custom `/auth/refresh` rotation interceptor (supabase-js auto-refreshes). Keep a 401 → sign-out path.
- **Delete** `OAuthSuccessPage.jsx` and the one-time exchange-code flow; Supabase returns the session directly to the redirect target.
- Settings page: change-email / change-password now call `supabase.auth.updateUser(...)` with reauthentication where Supabase requires it; email change goes through Supabase's confirmation email.

### 5.3 Env
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Update the frontend `.env` example and the proxy/deploy notes.

---

## 6. Supabase dashboard configuration (owner-performed)

The implementer cannot access the Supabase dashboard or provider secrets. The plan will ship an exact checklist; the account owner performs it:

1. **Auth → Providers → Email:** enable; **Confirm email = ON** (recommended, production standard). Configure custom SMTP for production email volume (Supabase's built-in SMTP is rate-limited).
2. **Redirect URLs (Auth → URL Configuration):** add local dev origin(s) and the production frontend origin(s), including the `redirectTo` targets used by `signInWithOAuth`.
3. **Google / GitHub / LinkedIn (OIDC):** enable each provider in Supabase, reusing the existing OAuth client IDs/secrets. In each provider's own console, add the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback` to the allowed redirect URIs.
4. Provide the four backend env values + two frontend env values to the deployment environments.

---

## 7. Testing plan (Playwright MCP)

**Automated (email/password, full E2E):**
- Register a new account → email-confirmation gate → confirm (via Supabase admin API or local Inbucket in a local Supabase stack) → login → session established → an authenticated `/api/*` call succeeds with the Supabase bearer token → logout clears the session.
- Negative: wrong password rejected; unconfirmed account cannot access authed routes.
- Migrated-user check: a pre-existing account logs in with its original password after the import.

**Social providers (documented, partly manual):**
- Automated: assert each provider button triggers `signInWithOAuth` and navigates to the correct real provider authorization URL; assert the app's redirect/callback path establishes a session when Supabase returns one.
- Manual: completing a real Google/GitHub/LinkedIn credential round-trip is not reliably automatable and is contrary to provider automation policies. Verified by hand against the configured provider apps; steps documented in the plan.

**Regression:** existing backend `node --test` auth-related suites and frontend `LoginPage.test.jsx` / `RegisterPage.test.jsx` updated to the new flow; a representative authed route still authorizes with a Supabase token and rejects a bad token.

---

## 8. Cutover & rollback

- **Cutover:** deploy backend (accepts Supabase JWTs) + frontend (issues them) together. All currently-logged-in users are signed out once because old custom JWTs are no longer accepted; passwords are preserved, so re-login is seamless.
- **Sequencing:** (1) import migration + trigger, (2) verify in target env, (3) deploy code, (4) schema-cleanup migration dropping password/token columns and the refresh-token table.
- **Rollback (pre-cleanup):** because the cleanup migration is deliberately last and `password_hash`/`token_version`/`auth_refresh_tokens` are retained until then, reverting the code redeploy restores the old auth without data loss. After cleanup, rollback requires restoring those columns from backup.

---

## 9. Risks

- **auth-schema writes:** the import writes to the `auth` schema; must run with sufficient privilege and match GoTrue's expected columns exactly, or logins fail silently. Mitigation: verify with a real login before cleanup; keep it idempotent.
- **JWT signing mode mismatch:** verify path must match the project's signing (asymmetric JWKS vs legacy HS256). Mitigation: JWKS-first with HS256 fallback; confirm against the live token in testing.
- **Email deliverability:** confirm-email gate depends on working SMTP. Mitigation: custom SMTP in the dashboard checklist; document the local Inbucket path for testing.
- **Social round-trip:** only manually verifiable end-to-end. Mitigation: automate up to the provider handoff; document manual steps.
- **Session shape drift:** anything reading non-id claims off `req.user` must be re-sourced from the profile table. Mitigation: audit `req.user.*` usages during implementation.

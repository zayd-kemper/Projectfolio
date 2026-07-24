# Supabase Auth Migration — Design

**Date:** 2026-07-24
**Status:** **Finalized** — design approved and reconciled against the live project. Implementation plan: [`docs/superpowers/plans/2026-07-24-supabase-auth-migration.md`](../plans/2026-07-24-supabase-auth-migration.md)
**Scope:** Replace the hand-rolled email/password + Passport OAuth system with Supabase Auth (GoTrue) as the identity provider and token issuer, for email/password and three social providers (Google, GitHub, LinkedIn).

> **Reading order.** §1–§9 are the original approved design and are unchanged except where marked **[FINAL]**. §10 records the facts verified against the live Supabase project on 2026-07-24 — these supersede any assumption in §1–§9. §11 records the eight changes made to the design during planning, with reasons.

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
  - bcryptjs produces `$2a$`/`$2b$` bcrypt hashes; GoTrue verifies bcrypt, so existing passwords keep working unchanged. **[FINAL]** Verified: all 78 hashes in the live database are 60-char `$2a$`.
- **[FINAL] `email_confirmed_at` is set unconditionally for every imported account**, not gated on `is_email_verified`. Only 2 of 79 rows carry that flag, so gating would lock 77 working accounts out the moment the confirm-email gate is switched on. Their existing password already proves custody.
- **[FINAL] The GoTrue NULL-string trap.** "The required GoTrue bookkeeping columns" is too vague to implement safely, and getting it wrong is the single most likely way this migration fails. Concretely, the insert must set:
  - `instance_id` = `'00000000-0000-0000-0000-000000000000'`, `aud` = `'authenticated'`, `role` = `'authenticated'`
  - `raw_app_meta_data` = `{"provider": <first>, "providers": [...]}`, `raw_user_meta_data` carrying `full_name`/`username`/`avatar_url`/`email`
  - **empty strings — not NULL — in all eight of** `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`. These are nullable in the DDL but GoTrue's Go model scans them into non-nullable `string` fields; a NULL produces `sql: Scan error … converting NULL to string is unsupported` and **every imported user's login fails with a 500**.
  - **never** `confirmed_at` — it is `GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at))`.

### 3.2 Social identities
For each `google_id` / `github_id` / `linkedin_id` present on a `users` row, insert an `auth.identities` row (`provider`, `provider_id`, `user_id`, `identity_data`) so that a future social login re-links to the **same** account rather than creating a duplicate. This covers both OAuth-only accounts (null password) and password accounts that had also linked a provider.

**[FINAL]** Three clarifications:
- The provider slug for LinkedIn is **`linkedin_oidc`**, not `linkedin`. The legacy `*_id` columns all hold the provider's `sub` claim, which is exactly what `auth.identities.provider_id` stores, so they map across 1:1.
- Password accounts also need an **`email` identity** row (`provider_id` = the user's own uuid as text). Modern GoTrue creates one on every password signup; without it the account shows no provider in the dashboard and identity linking/unlinking misbehaves.
- **Never** insert `auth.identities.email` — it is `GENERATED ALWAYS AS (lower(identity_data->>'email'))`.

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

**[FINAL]** The draft of this trigger already in the working tree (`backend/migrations/011_supabase_auth_trigger.sql`, uncommitted and unapplied) has a username bug that must be fixed before it is applied: it calls `lower(regexp_replace(x, '[^a-z0-9-]', '', 'g'))`, and that character class deletes every uppercase letter *before* `lower()` folds it. Evaluated against the live database — `Maya Iyer` → `ayayer`, `Zoë Müller` → `oller`, and `JORDAN O'NEIL` → NULL, which falls through to the literal `user` so that **every** all-caps display name contends for one username. The operands must be swapped to `regexp_replace(lower(x), …)`. The same function also needs NULL-safety for `NEW.email`, a fallback for `full_name` (which is `NOT NULL` in `public.users`), and a bounded dedup loop — anything that RAISEs here surfaces as "Database error saving new user" and fails the signup outright.

### 3.5 Email sync trigger **[FINAL — added during planning]**
`handle_new_user` alone leaves the mirror one-directional. Once Supabase owns the email address (§5.2 routes changes through `supabase.auth.updateUser`), nothing writes the new address back to `public.users.email` — which is `UNIQUE NOT NULL` and is read by `/auth/me`, Discover, and the public portfolio pages. A second trigger, `AFTER UPDATE OF email, email_confirmed_at ON auth.users`, mirrors both the address and the confirmation state back onto the profile row.

---

## 4. Backend changes

### 4.1 Rewrite `middleware/auth.js`
- Verify the incoming bearer token as a **Supabase JWT** via JWKS, using `jose`'s `createRemoteJWKSet` against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
- **[FINAL] No HS256 fallback.** The draft called for `SUPABASE_JWT_SECRET` as a fallback "for projects still on the legacy shared secret." Verified: this project's JWKS endpoint serves a single **ES256** EC P-256 key, so the fallback is dead code and one more secret to manage. Verification is JWKS-only, `algorithms: ['ES256']`. `jose` caches the key set and refetches on an unknown `kid`, so dashboard key rotation needs no redeploy. The trade-off is explicit: if the project is ever reverted to legacy HS256 signing, every token is rejected until that is undone — the deployment runbook checks the JWKS endpoint returns a non-empty `keys` array before cutover.
- On success: `req.user = { id: payload.sub, email, ... }`. Downstream routes that only use `req.user.id` are unaffected.
- Remove `tokenVersion` freshness checks; Supabase owns session revocation and refresh. `optionalAuth` keeps the same shape (verify if present, ignore on failure).
- **[FINAL] Profile fields are resolved from the database, via a Redis-cached lookup.** Audited usage: `req.user.full_name` is read by `routes/collaborators.js` (4×), `routes/endorsements.js` (3×) and `routes/teams.js` (2×); `req.user.username` by `routes/collaborators.js` (2×) and `routes/auth.js` (1×). The JWT's `user_metadata` is the wrong source — it is a snapshot that goes stale on the next profile edit, and it never carries `username` at all. A new `utils/authProfile.js` reads `public.users` with a 60s Redis cache, replacing `utils/authTokenVersion.js` one-for-one. This is a like-for-like swap, not new per-request database traffic: the old middleware already reached the database indirectly through that same Redis-cached pattern, which is why `test/scalability.test.js:23` ("auth stays independent of user lookups", asserted as *no direct* `config/database` import) continues to hold.

### 4.2 Trim `routes/auth.js`
- **Delete** handlers now owned by Supabase: `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `PUT /change-password`, `PUT /change-email`.
- **Keep** `GET /me` (joins profile + portfolio settings) and `PUT /profile` (profile edits), both behind the new `requireAuth`.

### 4.3 Delete obsolete modules
- `config/passport.js`, `routes/oauth.js`, `utils/tokens.js`, `utils/authTokenVersion.js`.
- In `server.js`: remove passport initialize/session middleware, the OAuth router mount, and the session store wiring that existed solely for the OAuth login flow. **[FINAL]** Audited: `req.session` appears nowhere outside passport, so `express-session` and `connect-redis` are both dropped, along with `passport`, `passport-github2`, `passport-google-oauth20`, `passport-openidconnect`, and `jsonwebtoken`.
- **[FINAL] Three call sites the draft did not account for**, each a silent or hard break:
  - `server.js:81` — the `/api/notifications` polling rate limiter verifies a legacy JWT inline and keys on `decoded.userId`. Left alone it degrades to IP-keyed limiting, so users behind one NAT throttle each other. Rewired to key on the verified Supabase `sub`.
  - `routes/agent.js:1226-1249` + `utils/agentBrowserVerifier.js:933,1110` — the AI site agent mints its own `jwt.sign({ userId }, JWT_SECRET)` and injects it as `localStorage.token`/`localStorage.user` so the Puppeteer verifier can load authenticated routes. Both halves break, and the failure is silent: verification would run logged-out and report false failures. Replaced with a real single-use Supabase magic link (`auth.admin.generateLink`) that the browser navigates once, with the same graceful "no credentials → public routes only" degradation the old code had when `JWT_SECRET` was unset.
  - `routes/analytics.js:30` — falls back to `JWT_SECRET` when `ANALYTICS_VISITOR_SECRET` is unset. The fallback is removed and the variable becomes a required production boot check.
- **[FINAL] Guard-rail files that assert on deleted code.** `test/scalability.test.js:68-74` (in the `npm test` list) and `scripts/verifyScalability.js:11,12,25` read `config/passport.js`, `utils/tokens.js`, and `server.js`'s `SessionRedisStore`. All four checks are rewritten to assert the weaker paths are gone rather than that they are configured.

### 4.4 Schema cleanup migration (after cutover verified)
- Drop `auth_refresh_tokens`.
- Drop `users.password_hash`, `users.token_version`.
- **[FINAL] The `users.id → auth.users(id)` foreign key moves out of this migration and into the import migration**, in the same transaction as the inserts. Adding it there makes it the import's *verification step*: a single un-imported profile makes `ADD CONSTRAINT` fail and rolls the whole thing back, which is a loud failure instead of a half-migrated database. Bundling it with the destructive drops would have deferred that check past the point of no return.
- **[FINAL]** `users.google_id` / `github_id` / `linkedin_id` are deliberately **kept**. They are now denormalised copies of `auth.identities.provider_id`, they are still referenced by the profile and integrations surfaces, and they are the audit trail for this import.

### 4.5 New dependencies / env
- Backend deps: `jose` (JWT/JWKS verify), `@supabase/supabase-js` (admin client for the agent verifier login link and any future admin operations).
- **[FINAL]** Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **`SUPABASE_JWT_SECRET` is not used** — see §4.1. `ANALYTICS_VISITOR_SECRET` becomes required in production. `JWT_SECRET`, `SESSION_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_DAYS`, and the six `GOOGLE_`/`GITHUB_`/`LINKEDIN_` OAuth variables are removed from `.env.example` (the provider credentials move into the Supabase dashboard), though leaving the values set in the deployment during the rollback window costs nothing and makes a code revert a one-step operation.

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
- **Delete** `OAuthSuccessPage.jsx` and the one-time exchange-code flow; Supabase returns the session directly to the redirect target. **[FINAL]** It is replaced by `AuthCallbackPage.jsx` at the route **`/auth/callback`** — a single landing route for OAuth, email confirmation, and password recovery. Every `redirectTo` / `emailRedirectTo` the app emits is `<origin>/auth/callback`, and that is the exact string list the Supabase dashboard's redirect allowlist must contain. The client uses the PKCE flow, so the callback also exchanges a `?code=` when `detectSessionInUrl` has not already established the session.
- Settings page: change-email / change-password now call `supabase.auth.updateUser(...)` with reauthentication where Supabase requires it; email change goes through Supabase's confirmation email. **[FINAL]** Two behavioural consequences to surface in the UI copy: `updateUser({ password })` does **not** verify the old password, so the page must re-authenticate with `signInWithPassword` first to preserve the old route's behaviour; and the email address no longer changes immediately — it changes when the user clicks the confirmation link, at which point the §3.5 trigger syncs the profile row.

### 5.4 Password reset **[FINAL — added during planning, droppable]**
The app has never had a password-reset flow, and shipping a confirm-email gate without a recovery path is a support burden. Supabase provides it for roughly 40 lines: `/forgot-password` calling `resetPasswordForEmail` and `/reset-password` calling `updateUser({ password })`, with `AuthCallbackPage` routing `type=recovery` to the latter. This is the one item in the plan that is not traceable to the original design; it is isolated in its own task and nothing else depends on it.

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
- **Session shape drift:** anything reading non-id claims off `req.user` must be re-sourced from the profile table. Mitigation: audit `req.user.*` usages during implementation. **[FINAL — done, see §4.1]** The full set is `full_name` (9 call sites) and `username` (3).

---

## 10. Verified environment facts **[FINAL]**

Established by reading the live Supabase project and the codebase on 2026-07-24. These supersede any assumption in §1–§9. Read-only queries only — nothing was mutated.

### 10.1 Project and privileges
| Fact | Value | Consequence |
|---|---|---|
| Project ref | `dhzhtigowbvlmcrwvwix` (`us-east-1`, Postgres 17.6.1.141) | — |
| Backend DB role | `postgres` (session pooler), **not** superuser | — |
| `auth.users` owner | `supabase_auth_admin` | trigger functions must be `SECURITY DEFINER` owned by `postgres` |
| `postgres` privileges on `auth` | `USAGE` on schema; `TRIGGER`, `INSERT`, `REFERENCES` on `users` and `identities` | **auth-schema DDL can run through `npm run db:migrate`** — no SQL-editor step, no separate tooling |
| JWT signing | **ES256**, one EC P-256 key at the JWKS endpoint | JWKS-only verification; no HS256 fallback (§4.1) |
| `public.users` RLS | enabled, 0 policies (deny-all); `postgres` bypasses as owner | unchanged — this is how the app writes today |

### 10.2 Data to migrate
79 `public.users` rows: 78 with `password_hash`, 2 `google_id`, 2 `linkedin_id`, 0 `github_id`, 1 OAuth-only account.

Pre-flight checks, all clean: 0 null emails, 0 case-insensitive duplicate emails, 0 non-lowercase emails, 0 users with no credential at all, 0 users missing `portfolio_settings`, 0 non-bcrypt hashes. Only **2** of 79 have `is_email_verified = true` — the reason §3.1 confirms every imported account unconditionally.

The import's SELECT halves were executed read-only and produce: **79** `auth.users` rows and **82** `auth.identities` rows (78 `email`, 2 `google`, 2 `linkedin_oidc`), with **0** duplicate `(provider, provider_id)` pairs, so the unique constraint will not abort the insert. These are the expected values for the post-migration verification query.

### 10.3 Current migration state
12 migrations applied (`000`–`010`). `backend/migrations/010_github_oauth.sql` and `011_supabase_auth_trigger.sql` are **uncommitted working-tree files**; `010` is applied, `011` is not. `auth.users` and `auth.identities` are both empty and neither trigger exists — nothing has been migrated yet, so `011` can still be rewritten in place.

---

## 11. Finalized decisions **[FINAL]**

Eight changes to the design, made after the audit above. Each is implemented in the plan.

| # | Change | Why |
|---|---|---|
| 1 | HS256 fallback dropped (§4.1) | project is confirmed ES256-only; the fallback is dead code and an extra secret |
| 2 | GoTrue NULL-string columns made explicit (§3.1) | the vaguest line in the draft guarded the most likely silent failure — every imported login 500s |
| 3 | Polling rate limiter rewired (§4.3) | unlisted `jwt.verify` at `server.js:81`; silently degrades to IP keying |
| 4 | AI browser verifier re-authenticated (§4.3) | unlisted self-minted JWT + `localStorage` injection; silently reports false verification failures |
| 5 | Scalability guard rails updated (§4.3) | four checks assert on files this migration deletes; two are hard `npm test` breaks |
| 6 | Username derivation bug fixed (§3.4) | `lower(regexp_replace(…))` mangles every mixed-case name and nulls every all-caps one |
| 7 | Email-sync trigger added (§3.5) | the draft's mirror was one-directional; `public.users.email` would go stale after any email change |
| 8 | FK moved into the import migration (§4.4) | it becomes the import's verification step — abort-and-roll-back instead of a half-migrated database |

Plus one addition traceable to no part of the original design, isolated so it can be dropped: **password reset** (§5.4).

### 11.1 Deployment readiness checklist
The migration is deployment-ready when all of these hold. The plan's Task 12 and Task 13 carry the executable form.

- [ ] Supabase dashboard: email provider on, **Confirm email on**, min password length 8, custom SMTP configured (the built-in sender is rate-limited and unusable for real signups).
- [ ] Redirect allowlist contains `https://<app-domain>/auth/callback`, `http://localhost:3000/auth/callback`, `http://localhost:5173/auth/callback`.
- [ ] Google, GitHub, and LinkedIn (OIDC) enabled in Supabase with the existing client IDs/secrets; each provider console has `https://dhzhtigowbvlmcrwvwix.supabase.co/auth/v1/callback` added **alongside** the app's existing callback, so a rollback still works.
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANALYTICS_VISITOR_SECRET` set on the backend; `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set on the frontend build.
- [ ] JWKS endpoint returns a non-empty `keys` array.
- [ ] Migrations `011` and `012` applied; post-import verification returns 79/79 profiles, 0 unimported, 0 unconfirmed, **0 rows with a NULL bookkeeping string**, 78 email + 4 social identities, 2 triggers, 1 FK.
- [ ] Backend and frontend deployed in the same window; `/health/ready` reports `auth_triggers: 2`.
- [ ] A pre-existing account signs in with its original password.
- [ ] A real Google/LinkedIn/GitHub round-trip lands on the **existing** profile, not a new empty one — this is the check that proves the identity import worked, and it is the last gate before the destructive cleanup migration.
- [ ] One business day of soak before applying `013`. Until `013` runs, reverting the code deploy restores the old auth with no data loss; afterwards, rollback needs a database restore.

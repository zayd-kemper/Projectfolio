# Supabase Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled email/password + Passport OAuth stack with Supabase Auth (GoTrue) as the sole identity provider and token issuer for email/password, Google, GitHub, and LinkedIn — preserving all 79 existing accounts (same uuid, same password, same linked social identities) and leaving the system deployable.

**Architecture:** Supabase Auth owns credentials, sessions, refresh, and OAuth. The existing `public.users` table is demoted to a **profile** table linked 1:1 to `auth.users` by shared uuid, so every FK that references `users.id` keeps working with no data remap. The backend stays a service-role BFF: it keeps reading/writing all application tables through the pg pool, and its only auth job becomes *verifying a Supabase JWT and resolving the caller's profile*. RLS stays deny-all. The SPA talks to Supabase Auth directly via `@supabase/supabase-js` and sends the resulting access token to the existing API as a bearer token.

**Tech Stack:** Node 22 / Express, `jose` (ES256 JWKS verification), `@supabase/supabase-js` (frontend client + backend admin client), Postgres 17 (Supabase project `dhzhtigowbvlmcrwvwix`), React + Vite + Vitest, `node --test` (backend), MCP Playwright (E2E).

---

## Global Constraints

These are facts verified against the live project and codebase on 2026-07-24. Every task's requirements implicitly include this section.

**Live environment facts (verified, do not re-derive):**
- Supabase project ref: **`dhzhtigowbvlmcrwvwix`**, region `us-east-1`, Postgres `17.6.1.141`.
- The backend's `DATABASE_URL` role is **`postgres`** (via the session pooler, `postgres.dhzhtigowbvlmcrwvwix`). It is **not** superuser but **does** hold `TRIGGER`, `INSERT`, and `REFERENCES` on `auth.users` and `auth.identities`, and `USAGE` on the `auth` schema. **Therefore auth-schema DDL can and should be applied by `npm run db:migrate`** — no separate tooling, no SQL-editor step.
- `auth.users` is owned by `supabase_auth_admin`. Trigger functions on it must be `SECURITY DEFINER` owned by `postgres` (the Supabase-documented pattern).
- **The project signs JWTs with ES256 asymmetric keys.** `https://dhzhtigowbvlmcrwvwix.supabase.co/auth/v1/.well-known/jwks.json` returns a single EC P-256 key (`kid f6755c9f-d22f-4fdb-9396-871882b57173`). **Verification is JWKS-only — do not add an HS256 / `SUPABASE_JWT_SECRET` fallback.** It is dead code on this project and one more secret to leak.
- Current data: **79** `public.users` rows — 78 with `password_hash`, 2 `google_id`, 2 `linkedin_id`, 0 `github_id`. Zero null emails, zero case-insensitive duplicate emails, zero already-lowercase violations, zero users lacking every credential, zero users missing `portfolio_settings`. All 78 hashes are 60-char **`$2a$` bcrypt** — GoTrue verifies these natively, so passwords carry over unchanged.
- Only **2** of 79 users have `is_email_verified = true`. **Every imported user must get `email_confirmed_at` set** or 77 accounts are locked out the moment the confirm-email gate goes on. Their existing password is the proof of custody.
- `auth.users` currently has **0 rows** and `auth.identities` **0 rows**; `public.handle_new_user` and trigger `on_auth_user_created` **do not exist**. Nothing has been migrated yet.
- 12 migrations are applied (`000`–`010`). `backend/migrations/010_github_oauth.sql` and `011_supabase_auth_trigger.sql` are currently **uncommitted working-tree files**; `010` is applied, `011` is **not**.
- `public.users` has RLS enabled with 0 policies (deny-all). The `postgres` role bypasses it as owner — this is how the app already writes today. No change.

**Generated / trap columns — never INSERT these:**
- `auth.users.confirmed_at` is `GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at))`.
- `auth.identities.email` is `GENERATED ALWAYS AS (lower(identity_data->>'email'))`.

**The GoTrue NULL-string trap (highest-risk item in this plan):**
`auth.users.confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `phone_change`, `phone_change_token`, and `reauthentication_token` are nullable in the DDL, but GoTrue's Go model scans them into non-nullable `string` fields. A `NULL` produces `sql: Scan error … converting NULL to string is unsupported` and **every imported user's login fails with a 500**. The import MUST write `''` (empty string) into all eight. Same for `aud` (`'authenticated'`), `role` (`'authenticated'`), and `instance_id` (`'00000000-0000-0000-0000-000000000000'`).

**Column limits (truncate before insert):** `public.users.email` varchar(255), `full_name` varchar(255) **NOT NULL**, `username` varchar(100) **NOT NULL UNIQUE**, `avatar_url` varchar(500).

**Constraint names to target:** `portfolio_settings_user_id_key UNIQUE (user_id)`, `identities_provider_id_provider_unique UNIQUE (provider_id, provider)`.

**Provider naming:** Supabase provider slugs are `google`, `github`, and **`linkedin_oidc`** (not `linkedin`). The legacy `users.google_id` / `github_id` / `linkedin_id` values are all provider `sub` claims and map 1:1 onto `auth.identities.provider_id`.

**Project conventions:**
- No root package manifest. Run backend commands from `backend/`, frontend commands from `frontend/`.
- `backend/npm test` runs a **fixed file list** in `backend/package.json:18`. A new test file that is not added to that list will never run. A deleted test file must be removed from it or `npm test` breaks.
- Do not hand-edit an already-applied migration. `009` and earlier are applied — add new numbered files only. `011` is unapplied, so rewriting it in place is correct.
- Migrations are transactional unless the file starts with `-- no-transaction`. **Keep every migration in this plan transactional** — the runner only downgrades permission errors (`42501`) to warnings for `no-transaction` files, and silently skipping the auth trigger would be catastrophic.
- The `@` import alias resolves to `frontend/src/`.
- `tdd-guard` blocks backend writes unless `node:test` results were recorded — run the backend test command before editing backend source.

**Env var names (exact, used across tasks):**
- Backend: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Removed: `JWT_SECRET`, `SESSION_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_DAYS`, `GOOGLE_CLIENT_ID`/`SECRET`, `GITHUB_CLIENT_ID`/`SECRET`, `LINKEDIN_CLIENT_ID`/`SECRET` (the provider secrets move into the Supabase dashboard). **Keep `ANALYTICS_VISITOR_SECRET`** — `routes/analytics.js:30` falls back to `JWT_SECRET`, and that fallback must be removed, not the variable.

---

## Deviations from the design spec

The spec (`docs/superpowers/specs/2026-07-24-supabase-auth-migration-design.md`) is sound in its architecture. This plan changes eight things after auditing the live project. The spec has been updated to match; each item below is recorded there in §11.

1. **HS256 fallback dropped.** Spec §4.1 wanted "JWKS-first with HS256 fallback." The project is confirmed ES256-only. JWKS-only.
2. **The GoTrue NULL-string trap is made explicit.** Spec §3.1 said "plus the required GoTrue bookkeeping columns." That vagueness is the single most common way this migration fails silently.
3. **`server.js:81` polling rate limiter.** Not mentioned anywhere in the spec. It verifies a legacy JWT inline and keys on `decoded.userId`. Left alone it degrades every `/api/notifications` GET to IP-keyed limiting — users behind one NAT would throttle each other. Task 6 rewires it.
4. **The AI agent's browser verifier.** Not mentioned in the spec. `routes/agent.js:1226-1249` mints its own `jwt.sign({ userId }, JWT_SECRET)` and `utils/agentBrowserVerifier.js:933-936,1110-1114` injects it as `localStorage.token`/`localStorage.user`. Both break: the token is unverifiable and the SPA no longer reads that storage key. Authenticated-route verification would silently run logged-out and report false failures. Task 7 replaces it with a real Supabase session via an admin magic link.
5. **The scalability guard-rail files are load-bearing.** Three of their checks break on files this migration deletes: `test/scalability.test.js:68-74` and `scripts/verifyScalability.js:25` read `config/passport.js`; `verifyScalability.js:11` reads `utils/tokens.js` (deleted in Task 5, so the check throws `ENOENT` rather than failing cleanly); and `verifyScalability.js:12` asserts `SessionRedisStore` appears in `server.js`, which Task 6 removes. `scalability.test.js` is in the `npm test` list, so two of these are hard build breaks. Task 6 updates all four.
6. **A bug in the existing uncommitted `011_supabase_auth_trigger.sql`.** Lines 29-31 do `lower(regexp_replace(x, '[^a-z0-9-]', '', 'g'))` — the `[^a-z0-9-]` class strips every uppercase letter *before* `lower()` folds it. Every new social signup gets a mangled username. Evaluated against the live database:

   | Display name | Current `011` | Fixed |
   |---|---|---|
   | `Maya Iyer` | `ayayer` | `mayaiyer` |
   | `MayaIyer` | `ayayer` | `mayaiyer` |
   | `JORDAN O'NEIL` | **NULL** → falls back to `user` | `jordanoneil` |
   | `Zoë Müller` | `oller` | `zomller` |

   The all-caps case is the damaging one: the string reduces to empty, the `IF v_base IS NULL THEN v_base := 'user'` fallback fires, and **every** such signup contends for the single username `user` — which then leans on the unbounded dedup loop. Task 2 fixes the operand order and adds NULL-safety for `NEW.email`, a NOT NULL fallback for `full_name`, and a bounded dedup loop with a uuid-derived final fallback.
7. **Two-way email sync was missing.** Spec §5.2 routes email changes through `supabase.auth.updateUser`, but nothing writes the new address back to `public.users.email`, which is `UNIQUE NOT NULL` and read by `/auth/me`, Discover, and portfolio pages. Task 2 adds an `AFTER UPDATE OF email, email_confirmed_at` trigger.
8. **The FK is the import's verification step, and it moves earlier.** Spec §4.4 bundles `users.id → auth.users(id)` with the destructive column drops. Adding it in the same transaction as the import instead means a single un-imported profile aborts and rolls back the whole thing — a loud failure rather than a half-migrated database. The destructive drops stay last, in their own migration, gated on production verification.

**One addition beyond the spec (Task 11, droppable):** there is currently **no password-reset flow anywhere in the app**. Turning on the confirm-email gate without a recovery path is a support burden, and Supabase provides reset for ~40 lines. If you want to hold scope exactly to the spec, skip Task 11 — nothing else depends on it.

---

## File Structure

**Created**
| File | Responsibility |
|---|---|
| `backend/utils/supabaseJwt.js` | Verify a Supabase ES256 access token via cached remote JWKS. Nothing else. |
| `backend/utils/authProfile.js` | Resolve `userId → { id, email, username, full_name, avatar_url }` from `public.users`, Redis-cached. Replaces `utils/authTokenVersion.js` one-for-one. |
| `backend/utils/supabaseAdmin.js` | Service-role admin client + `createVerifierLoginLink(email)` for the browser verifier. |
| `backend/migrations/012_supabase_auth_import.sql` | One-time identity import + the `users.id → auth.users(id)` FK. |
| `backend/migrations/013_supabase_auth_cleanup.sql` | Destructive cleanup, applied only after production verification. |
| `backend/test/supabaseJwt.test.js` | Unit tests for token verification. |
| `backend/test/authProfile.test.js` | Unit tests for profile resolution + cache behaviour. |
| `backend/test/supabaseAuthMigrations.test.js` | Static assertions over the migration SQL (the NULL-string columns, generated columns, provider slugs, FK). |
| `frontend/src/lib/supabase.js` | The configured `@supabase/supabase-js` browser client. Single export. |
| `frontend/src/pages/AuthCallbackPage.jsx` | OAuth / email-confirm / recovery landing route. Replaces `OAuthSuccessPage.jsx`. |
| `frontend/src/pages/ForgotPasswordPage.jsx` | Request a reset email. (Task 11) |
| `frontend/src/pages/ResetPasswordPage.jsx` | Set a new password from a recovery session. (Task 11) |
| `frontend/src/lib/supabase.test.js` | Asserts client config (persistence, auto-refresh, PKCE). |
| `frontend/src/pages/AuthCallbackPage.test.jsx` | Callback routing tests. |

**Modified**
| File | Change |
|---|---|
| `backend/migrations/011_supabase_auth_trigger.sql` | Rewritten (unapplied, so editing in place is correct): fixed username bug + email-sync trigger. |
| `backend/middleware/auth.js` | Verify Supabase JWTs; resolve profile; drop `tokenVersion`. |
| `backend/routes/auth.js` | Delete 7 handlers; keep `GET /me` and `PUT /profile`. |
| `backend/server.js` | Drop passport/session; rewire polling limiter; new boot checks. |
| `backend/routes/agent.js:1226-1249` | Replace self-minted JWT with a Supabase magic link. |
| `backend/utils/agentBrowserVerifier.js:930-940,1105-1120` | Navigate the magic link instead of injecting `localStorage`. |
| `backend/package.json` | Deps in/out; test-list edits. |
| `backend/.env.example` | Supabase vars in, legacy auth vars out. |
| `backend/test/scalability.test.js:69`, `backend/scripts/verifyScalability.js:25` | Re-point the OAuth-hardening assertions. |
| `backend/routes/analytics.js:30` | Drop the `JWT_SECRET` fallback. |
| `frontend/src/hooks/useAuth.jsx` | Back with `supabase.auth`. |
| `frontend/src/utils/api.js` | Bearer from the Supabase session; delete the refresh interceptor. |
| `frontend/src/pages/LoginPage.jsx`, `RegisterPage.jsx` | `signInWithPassword` / `signUp` / `signInWithOAuth`. |
| `frontend/src/pages/AccountSettingsPage.jsx` | `supabase.auth.updateUser`. |
| `frontend/src/main.jsx:26,115` | Swap the `/oauth-success` route for `/auth/callback`. |
| `frontend/vite.config.js` | `supabase` manual chunk. |
| `frontend/.env.example` | Supabase vars. |
| `frontend/src/pages/LoginPage.test.jsx`, `RegisterPage.test.jsx` | Rewrite for the new flow. |
| `DEPLOYMENT.md` | Owner runbook + dashboard checklist. |

**Deleted**
`backend/config/passport.js`, `backend/routes/oauth.js`, `backend/utils/tokens.js`, `backend/utils/authTokenVersion.js`, `backend/test/githubOauth.test.js`, `frontend/src/pages/OAuthSuccessPage.jsx`.

---

## Pre-validated against the live database

The SELECT halves of migration `012` and the username expression from `011` were executed read-only against project `dhzhtigowbvlmcrwvwix` on 2026-07-24 (no INSERT, no DDL, nothing mutated). Results, which double as the expected values for Task 13 Step 3:

- `auth.users` rows the import will produce: **79** — 0 with a null provider, 0 unconfirmed, 1 OAuth-only (no password).
- Provider combinations present: `["email"]`, `["google","linkedin_oidc"]`, `["email","google","linkedin_oidc"]`.
- `auth.identities` rows: **82** total — 78 `email`, 2 `google`, 2 `linkedin_oidc`, 0 `github`.
- Duplicate `(provider, provider_id)` pairs within the batch: **0**, so `identities_provider_id_provider_unique` will not abort the insert.
- Users sharing a social `sub` across accounts: **0**.

The `CROSS JOIN LATERAL` / `array_remove` / `jsonb_build_object` constructions all parse and execute on Postgres 17 as written. What is **not** pre-validated: the INSERTs themselves, the `ALTER TABLE … ADD CONSTRAINT`, and the trigger DDL — those mutate and were deliberately left for Task 13.

---

## Sequencing

Tasks 1–13 are written in dependency order and each ends green. Deployment order is **not** the same as task order — see Task 13.

```
1  supabaseJwt verifier ─┐
2  DB: triggers          ├─► 4 middleware/auth.js ─► 5 routes/auth.js ─► 6 server.js ─► 7 agent verifier
3  DB: import + FK      ─┘                                                                    │
8  frontend client + useAuth + api.js ─► 9 Login/Register/callback ─► 10 account settings ─► 11 reset
12 env + docs + owner checklist
13 cutover + E2E verification
```

---

### Task 1: Supabase JWT verification helper

Pure, dependency-light, and testable without a database. Everything downstream imports it.

**Files:**
- Create: `backend/utils/supabaseJwt.js`
- Test: `backend/test/supabaseJwt.test.js`
- Modify: `backend/package.json` (add `jose`, add the test file to the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `verifySupabaseToken(token) → Promise<{ sub, email, role, aud, exp, user_metadata, app_metadata }>` — resolves with the JWT payload, rejects on any invalid/expired/wrong-issuer token. Also exports `subjectFromToken(token) → Promise<string|null>` which resolves the `sub` or `null` instead of throwing (used by the rate limiter in Task 6), and `resetJwksCache()` for tests.

- [ ] **Step 1: Install `jose`**

```bash
cd backend
npm install jose@^5.9.6
```

- [ ] **Step 2: Write the failing test**

Create `backend/test/supabaseJwt.test.js`. It mints real ES256 tokens with `jose` and serves a local JWKS, so nothing hits the network.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// jose v5 is ESM-only; node:test supports top-level dynamic import in an async setup.
let jose;
let keyPair;
let jwksServer;
let jwksOrigin;

test.before(async () => {
  jose = await import('jose');
  keyPair = await jose.generateKeyPair('ES256', { extractable: true });
  const jwk = await jose.exportJWK(keyPair.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  const body = JSON.stringify({ keys: [jwk] });
  jwksServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  });
  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksOrigin = `http://127.0.0.1:${jwksServer.address().port}`;
  process.env.SUPABASE_URL = jwksOrigin;
});

test.after(() => new Promise((resolve) => jwksServer.close(resolve)));

const sign = async (claims, { expiresIn = '1h' } = {}) =>
  new jose.SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setIssuer(`${jwksOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(keyPair.privateKey);

test('verifySupabaseToken returns the payload for a valid token', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const token = await sign({ sub: '11111111-1111-1111-1111-111111111111', email: 'a@b.com' });
  const payload = await verifySupabaseToken(token);
  assert.equal(payload.sub, '11111111-1111-1111-1111-111111111111');
  assert.equal(payload.email, 'a@b.com');
});

test('verifySupabaseToken rejects an expired token', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const token = await sign({ sub: 'u1' }, { expiresIn: '-1s' });
  await assert.rejects(() => verifySupabaseToken(token));
});

test('verifySupabaseToken rejects a token signed by a different key', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const other = await jose.generateKeyPair('ES256');
  const token = await new jose.SignJWT({ sub: 'u1', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setIssuer(`${jwksOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(other.privateKey);
  await assert.rejects(() => verifySupabaseToken(token));
});

test('verifySupabaseToken rejects a token from a different issuer', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const token = await new jose.SignJWT({ sub: 'u1', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setIssuer('https://evil.example.com/auth/v1')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(keyPair.privateKey);
  await assert.rejects(() => verifySupabaseToken(token));
});

test('subjectFromToken returns null instead of throwing on a bad token', async () => {
  const { subjectFromToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  assert.equal(await subjectFromToken('not-a-jwt'), null);
  const good = await sign({ sub: 'u-42' });
  assert.equal(await subjectFromToken(good), 'u-42');
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
cd backend
node --test test/supabaseJwt.test.js
```
Expected: FAIL — `Cannot find module '../utils/supabaseJwt'`.

- [ ] **Step 4: Write the implementation**

Create `backend/utils/supabaseJwt.js`:

```js
// Verifies Supabase Auth (GoTrue) access tokens.
//
// The project signs with asymmetric ES256 keys, so verification is JWKS-only:
// there is deliberately no HS256 / SUPABASE_JWT_SECRET path. `jose` caches the
// key set in-process and refetches on unknown `kid`, so key rotation in the
// Supabase dashboard needs no redeploy.

let jwksPromise = null;
let cachedIssuer = null;

const supabaseOrigin = () => {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not configured.');
  return url.replace(/\/$/, '');
};

const getJose = () => import('jose');

const getJwks = async () => {
  const origin = supabaseOrigin();
  if (!jwksPromise || cachedIssuer !== origin) {
    cachedIssuer = origin;
    jwksPromise = getJose().then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(new URL(`${origin}/auth/v1/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      })
    );
  }
  return jwksPromise;
};

const resetJwksCache = () => {
  jwksPromise = null;
  cachedIssuer = null;
};

const verifySupabaseToken = async (token) => {
  if (!token || typeof token !== 'string') throw new Error('Missing access token.');
  const [{ jwtVerify }, jwks] = await Promise.all([getJose(), getJwks()]);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${supabaseOrigin()}/auth/v1`,
    audience: 'authenticated',
    algorithms: ['ES256'],
  });
  if (!payload.sub) throw new Error('Token has no subject.');
  return payload;
};

// Non-throwing variant for non-security-critical keying (rate limits).
const subjectFromToken = async (token) => {
  try {
    const payload = await verifySupabaseToken(token);
    return payload.sub;
  } catch {
    return null;
  }
};

module.exports = { verifySupabaseToken, subjectFromToken, resetJwksCache };
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd backend
node --test test/supabaseJwt.test.js
```
Expected: PASS, 5 tests.

- [ ] **Step 6: Register the test in the suite**

In `backend/package.json:18`, append ` test/supabaseJwt.test.js` to the end of the `test` script's file list.

- [ ] **Step 7: Commit**

```bash
git add backend/utils/supabaseJwt.js backend/test/supabaseJwt.test.js backend/package.json backend/package-lock.json
git commit -m "feat(auth): add Supabase ES256 JWT verification helper"
```

---

### Task 2: Database triggers — profile provisioning and email sync

Rewrites the uncommitted, unapplied `011`. Nothing is applied to the database in this task; Task 13 handles that.

**Files:**
- Modify (rewrite in place): `backend/migrations/011_supabase_auth_trigger.sql`
- Test: `backend/test/supabaseAuthMigrations.test.js`
- Modify: `backend/package.json` (add the test file to the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: two Postgres functions and triggers on `auth.users` — `public.handle_new_user()` / `on_auth_user_created` (AFTER INSERT) and `public.handle_user_email_sync()` / `on_auth_user_email_sync` (AFTER UPDATE OF email, email_confirmed_at). Task 3's import relies on `handle_new_user` being a no-op for ids that already have a profile. Task 12's readiness probe asserts both triggers exist by these exact names.

- [ ] **Step 1: Write the failing test**

Create `backend/test/supabaseAuthMigrations.test.js`. These are static assertions over the SQL text — they catch the exact regressions that make this migration fail silently, without needing a live database.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8');

test('011 lowercases before stripping non-username characters', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  // lower(regexp_replace(x, '[^a-z0-9-]', ...)) deletes uppercase letters first:
  // 'MayaIyer' would become 'ayayer'. The lower() must be on the inside.
  assert.ok(
    /regexp_replace\(\s*lower\(/i.test(sql),
    'username derivation must call regexp_replace(lower(...)), not lower(regexp_replace(...))'
  );
  assert.ok(
    !/lower\(\s*regexp_replace\(/i.test(sql),
    'found lower(regexp_replace(...)) — this strips uppercase letters before folding them'
  );
});

test('011 creates both the provisioning and the email-sync trigger', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  assert.match(sql, /CREATE TRIGGER on_auth_user_created\b/);
  assert.match(sql, /CREATE TRIGGER on_auth_user_email_sync\b/);
  assert.match(sql, /AFTER UPDATE OF email, email_confirmed_at ON auth\.users/);
});

test('011 guards against a null auth email and a null full_name', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  assert.match(sql, /COALESCE\(NEW\.email, ''\)/);
  // public.users.full_name is NOT NULL — a null here 500s every social signup.
  assert.match(sql, /'ProjectFolio user'/);
});

test('011 bounds the username dedup loop', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  assert.ok(
    /WHILE\s+v_try\s*<\s*\d+/i.test(sql),
    'the dedup loop must be bounded, not WHILE EXISTS(...) alone'
  );
});

test('011 is transactional so a privilege failure aborts loudly', () => {
  assert.ok(!/^\s*--\s*no-transaction/im.test(read('011_supabase_auth_trigger.sql')));
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd backend
node --test test/supabaseAuthMigrations.test.js
```
Expected: FAIL — the current `011` uses `lower(regexp_replace(...))`, has no email-sync trigger, and has an unbounded loop.

- [ ] **Step 3: Rewrite the migration**

Replace the entire contents of `backend/migrations/011_supabase_auth_trigger.sql`:

```sql
-- Supabase Auth migration (part 1 of 3): profile provisioning + email sync.
--
-- After GoTrue writes auth.users (email signup or any social provider), mirror the
-- identity into the public.users profile table and create default portfolio_settings.
-- Import-safe: if a profile already exists for the id (the Task-3 import), it no-ops.
--
-- Runs as the `postgres` role, which holds TRIGGER on auth.users (owned by
-- supabase_auth_admin). The functions are SECURITY DEFINER so they can write the
-- public schema when invoked by supabase_auth_admin during a signup.
--
-- Anything that RAISEs in handle_new_user surfaces to the client as
-- "Database error saving new user" and fails the signup outright, so every branch
-- below is defensive about nulls and length limits.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta       jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_email    text  := lower(COALESCE(NEW.email, ''));
  v_local    text  := NULLIF(split_part(v_email, '@', 1), '');
  v_full     text;
  v_avatar   text;
  v_base     text;
  v_username text;
  v_try      int   := 0;
BEGIN
  -- Import-safe: profiles that already exist keep their row untouched.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'handle_new_user: auth user % has no email', NEW.id;
  END IF;

  -- public.users.full_name is NOT NULL, so this must always resolve to something.
  v_full := COALESCE(
    NULLIF(meta->>'full_name', ''),
    NULLIF(meta->>'name', ''),
    NULLIF(meta->>'user_name', ''),
    v_local,
    'ProjectFolio user'
  );
  v_avatar := COALESCE(NULLIF(meta->>'avatar_url', ''), NULLIF(meta->>'picture', ''));

  -- Fold case BEFORE stripping: the [^a-z0-9-] class would otherwise delete every
  -- uppercase letter ('MayaIyer' -> 'ayayer' instead of 'mayaiyer').
  v_base := regexp_replace(
    lower(COALESCE(
      NULLIF(meta->>'username', ''),
      NULLIF(meta->>'user_name', ''),
      v_full,
      v_local
    )),
    '[^a-z0-9-]', '', 'g');
  v_base := left(NULLIF(v_base, ''), 40);
  IF v_base IS NULL THEN v_base := 'user'; END IF;

  -- Bounded: a few random suffixes, then a uuid-derived suffix that cannot collide.
  v_username := v_base;
  WHILE v_try < 5 AND EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_try := v_try + 1;
    v_username := left(v_base, 34) || '-' || floor(random() * 9000 + 1000)::int;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username) THEN
    v_username := left(v_base, 27) || '-' || left(replace(NEW.id::text, '-', ''), 12);
  END IF;

  INSERT INTO public.users (id, email, full_name, username, avatar_url, is_email_verified)
  VALUES (
    NEW.id,
    left(v_email, 255),
    left(v_full, 255),
    left(v_username, 100),
    left(v_avatar, 500),
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.portfolio_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Keep the profile mirror honest when Supabase owns the email.
-- supabase.auth.updateUser({ email }) and the confirm-email round trip both land
-- here; without this, public.users.email (UNIQUE NOT NULL, read by /auth/me,
-- Discover, and the public portfolio pages) silently goes stale.
CREATE OR REPLACE FUNCTION public.handle_user_email_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET email             = left(lower(COALESCE(NEW.email, email)), 255),
         is_email_verified = NEW.email_confirmed_at IS NOT NULL,
         updated_at        = now()
   WHERE id = NEW.id
     AND (
       email IS DISTINCT FROM left(lower(COALESCE(NEW.email, email)), 255)
       OR is_email_verified IS DISTINCT FROM (NEW.email_confirmed_at IS NOT NULL)
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_sync();
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd backend
node --test test/supabaseAuthMigrations.test.js
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Register the test in the suite**

In `backend/package.json:18`, append ` test/supabaseAuthMigrations.test.js` to the `test` script's file list.

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/011_supabase_auth_trigger.sql backend/test/supabaseAuthMigrations.test.js backend/package.json
git commit -m "feat(auth): profile-provisioning and email-sync triggers on auth.users"
```

---

### Task 3: Database migration — import existing identities

The one-shot import. Transactional and idempotent; the FK at the end is the verification.

**Files:**
- Create: `backend/migrations/012_supabase_auth_import.sql`
- Modify: `backend/test/supabaseAuthMigrations.test.js` (add assertions)

**Interfaces:**
- Consumes: the triggers from Task 2 (already installed, no-op during import).
- Produces: one `auth.users` row per `public.users` row; one `auth.identities` row per credential; the constraint `public.users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/supabaseAuthMigrations.test.js`:

```js
// ── 012: the import ──────────────────────────────────────────────────────────
const NULL_STRING_COLUMNS = [
  'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
  'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token',
];

test('012 writes empty strings into every GoTrue NULL-string column', () => {
  const sql = read('012_supabase_auth_import.sql');
  for (const column of NULL_STRING_COLUMNS) {
    assert.ok(
      new RegExp(`\\b${column}\\b`).test(sql),
      `${column} must be listed in the auth.users insert — GoTrue scans it as a non-nullable string and NULL 500s every login`
    );
  }
});

test('012 sets the GoTrue bookkeeping columns', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /'00000000-0000-0000-0000-000000000000'/); // instance_id
  assert.match(sql, /'authenticated'/);                        // aud + role
});

test('012 never inserts a generated column', () => {
  const sql = read('012_supabase_auth_import.sql');
  const insertTargets = sql.match(/INSERT INTO auth\.\w+\s*\(([\s\S]*?)\)/g) || [];
  assert.ok(insertTargets.length >= 2, 'expected inserts into auth.users and auth.identities');
  for (const block of insertTargets) {
    assert.ok(!/\bconfirmed_at\b/.test(block), 'auth.users.confirmed_at is GENERATED ALWAYS');
    assert.ok(!/\bemail\s*,/.test(block.replace(/email_\w+/g, '')) || !/auth\.identities/.test(block),
      'auth.identities.email is GENERATED ALWAYS');
  }
});

test('012 confirms every imported account', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /email_confirmed_at/);
  assert.ok(
    !/is_email_verified\s+THEN/i.test(sql),
    'imported accounts must be confirmed unconditionally — only 2 of 79 have is_email_verified'
  );
});

test('012 uses linkedin_oidc, not linkedin, as the provider slug', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /'linkedin_oidc'/);
  assert.ok(!/'linkedin'/.test(sql), "Supabase's LinkedIn provider slug is linkedin_oidc");
});

test('012 adds the auth.users foreign key as its verification step', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /REFERENCES auth\.users\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i);
});

test('012 is idempotent and transactional', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.ok(!/^\s*--\s*no-transaction/im.test(sql));
  assert.ok((sql.match(/NOT EXISTS/gi) || []).length >= 3, 'each insert must be re-runnable');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd backend
node --test test/supabaseAuthMigrations.test.js
```
Expected: FAIL — `ENOENT … 012_supabase_auth_import.sql`.

- [ ] **Step 3: Write the migration**

Create `backend/migrations/012_supabase_auth_import.sql`:

```sql
-- Supabase Auth migration (part 2 of 3): import existing accounts into GoTrue.
--
-- Every public.users row becomes an auth.users row with the SAME uuid, so every
-- foreign key that references users(id) — projects, portfolio_settings,
-- background_jobs, endorsements, teams, … — keeps working with no remap.
--
-- Deliberately transactional. The foreign key at the bottom is the verification
-- step: if a single profile failed to import, the constraint cannot be added and
-- the whole migration rolls back, rather than leaving a half-migrated database.
--
-- Idempotent: every insert is guarded by NOT EXISTS, so a re-run is a no-op.
--
-- bcryptjs emits $2a$ hashes and GoTrue verifies bcrypt natively, so
-- password_hash transfers verbatim and existing passwords keep working.

-- ── Pre-flight ───────────────────────────────────────────────────────────────
-- Fail before touching anything if the source data cannot produce a valid login.
DO $$
DECLARE
  bad_email      int;
  dup_email      int;
  no_credential  int;
  bad_hash       int;
BEGIN
  SELECT count(*) INTO bad_email FROM public.users WHERE email IS NULL OR email = '';
  IF bad_email > 0 THEN
    RAISE EXCEPTION 'Import aborted: % profile(s) have no email', bad_email;
  END IF;

  SELECT count(*) INTO dup_email FROM (
    SELECT lower(email) FROM public.users GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dup_email > 0 THEN
    RAISE EXCEPTION 'Import aborted: % email(s) collide case-insensitively; auth.users requires uniqueness', dup_email;
  END IF;

  SELECT count(*) INTO no_credential FROM public.users
   WHERE password_hash IS NULL AND google_id IS NULL AND github_id IS NULL AND linkedin_id IS NULL;
  IF no_credential > 0 THEN
    RAISE EXCEPTION 'Import aborted: % profile(s) have no password and no linked provider and could never sign in', no_credential;
  END IF;

  SELECT count(*) INTO bad_hash FROM public.users
   WHERE password_hash IS NOT NULL AND password_hash !~ '^\$2[aby]\$';
  IF bad_hash > 0 THEN
    RAISE EXCEPTION 'Import aborted: % password hash(es) are not bcrypt; GoTrue cannot verify them', bad_hash;
  END IF;
END;
$$;

-- ── 1. auth.users ────────────────────────────────────────────────────────────
-- confirmation_token / recovery_token / email_change* / phone_change* /
-- reauthentication_token are nullable in the DDL but GoTrue scans them into
-- non-nullable Go strings. A NULL there produces
--   "sql: Scan error ... converting NULL to string is unsupported"
-- and every imported user's login fails with a 500. They MUST be ''.
--
-- confirmed_at is GENERATED ALWAYS (LEAST(email_confirmed_at, phone_confirmed_at))
-- and is deliberately absent from this column list.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  u.id,
  'authenticated',
  'authenticated',
  left(lower(u.email), 255),
  u.password_hash,
  -- Confirm every migrated account unconditionally. Only 2 of 79 carry
  -- is_email_verified, and gating on it would lock 77 working accounts out the
  -- moment "Confirm email" is switched on. Their password already proves custody.
  COALESCE(u.created_at, now()),
  NULL,
  jsonb_build_object('provider', p.providers[1], 'providers', to_jsonb(p.providers)),
  jsonb_strip_nulls(jsonb_build_object(
    'full_name',      u.full_name,
    'username',       u.username,
    'avatar_url',     u.avatar_url,
    'email',          lower(u.email),
    'email_verified', true,
    'phone_verified', false
  )),
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now()),
  '', '',
  '', '', '',
  '', '', '',
  false, false
FROM public.users u
CROSS JOIN LATERAL (
  SELECT array_remove(ARRAY[
    CASE WHEN u.password_hash IS NOT NULL THEN 'email'         END,
    CASE WHEN u.google_id     IS NOT NULL THEN 'google'        END,
    CASE WHEN u.github_id     IS NOT NULL THEN 'github'        END,
    CASE WHEN u.linkedin_id   IS NOT NULL THEN 'linkedin_oidc' END
  ]::text[], NULL) AS providers
) p
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

-- ── 2. auth.identities: the email identity for password accounts ─────────────
-- Modern GoTrue creates one of these on every password signup. Without it the
-- account shows no provider in the dashboard and identity linking/unlinking
-- misbehaves. provider_id for an email identity is the user's own uuid as text.
-- auth.identities.email is GENERATED ALWAYS from identity_data->>'email'.
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub',            u.id::text,
    'email',          lower(u.email),
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  NULL,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.users u
WHERE u.password_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.provider = 'email' AND i.provider_id = u.id::text
  );

-- ── 3. auth.identities: social providers ─────────────────────────────────────
-- google_id / github_id / linkedin_id all hold the provider's `sub` claim, which
-- is exactly what auth.identities.provider_id stores, so a future social login
-- re-links to the SAME account instead of creating a duplicate.
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  s.provider_id,
  u.id,
  jsonb_build_object(
    'sub',            s.provider_id,
    'email',          lower(u.email),
    'email_verified', true,
    'phone_verified', false
  ),
  s.provider,
  NULL,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.users u
CROSS JOIN LATERAL (VALUES
  ('google',        u.google_id),
  ('github',        u.github_id),
  ('linkedin_oidc', u.linkedin_id)
) AS s(provider, provider_id)
WHERE s.provider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.provider = s.provider AND i.provider_id = s.provider_id
  );

-- ── 4. Link the profile table to the identity table ──────────────────────────
-- This is the verification step. If any profile did not import, ADD CONSTRAINT
-- fails and the whole migration rolls back. ON DELETE CASCADE means deleting a
-- Supabase auth user removes the profile (and everything FK'd to it) as well.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd backend
node --test test/supabaseAuthMigrations.test.js
```
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/012_supabase_auth_import.sql backend/test/supabaseAuthMigrations.test.js
git commit -m "feat(auth): import existing accounts into Supabase Auth with FK verification"
```

---

### Task 4: Rewrite the auth middleware

**Files:**
- Create: `backend/utils/authProfile.js`
- Test: `backend/test/authProfile.test.js`
- Modify: `backend/middleware/auth.js` (full rewrite)
- Modify: `backend/package.json` (test list)

**Interfaces:**
- Consumes: `verifySupabaseToken` from Task 1.
- Produces: `requireAuth` / `optionalAuth` (unchanged names and Express signatures) setting `req.user = { id, email, username, full_name, avatar_url }` — same shape as before minus `token_version`. `utils/authProfile.js` exports `loadAuthProfile(userId) → Promise<profile|null>` and `invalidateAuthProfile(userId) → Promise<void>` (Task 5 calls the latter after a profile edit).

**Why a profile lookup at all:** `req.user.full_name` is read by `routes/collaborators.js` (4×), `routes/endorsements.js` (3×), `routes/teams.js` (2×); `req.user.username` by `routes/collaborators.js` (2×) and `routes/auth.js` (1×). The Supabase JWT carries `user_metadata` but that snapshot goes stale the moment a user edits their profile, and `username` is not in the token at all. Reading from `public.users` is the only correct source. It is cached in Redis for 60s using the same pattern as the `utils/authTokenVersion.js` module being deleted, so this adds no new infrastructure and no net per-request DB traffic.

- [ ] **Step 1: Write the failing test**

Create `backend/test/authProfile.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the two modules authProfile depends on before requiring it.
const Module = require('node:module');
const originalLoad = Module._load;
let queryCalls = [];
let queryResult = { rows: [] };
let redisStore = null;

Module._load = function (request, parent, isMain) {
  if (request === '../config/database') {
    return {
      query: async (sql, params) => {
        queryCalls.push({ sql, params });
        return queryResult;
      },
    };
  }
  if (request === '../config/redis') {
    return { getRedis: () => redisStore };
  }
  return originalLoad(request, parent, isMain);
};

const { loadAuthProfile, invalidateAuthProfile } = require('../utils/authProfile');
Module._load = originalLoad;

const PROFILE = {
  id: 'u-1', email: 'a@b.com', username: 'ab',
  full_name: 'A B', avatar_url: null,
};

test.beforeEach(() => {
  queryCalls = [];
  queryResult = { rows: [PROFILE] };
  redisStore = null;
});

test('loadAuthProfile reads the profile from the users table', async () => {
  const profile = await loadAuthProfile('u-1');
  assert.deepEqual(profile, PROFILE);
  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0].sql, /FROM users/i);
  assert.deepEqual(queryCalls[0].params, ['u-1']);
});

test('loadAuthProfile returns null when the profile is missing', async () => {
  queryResult = { rows: [] };
  assert.equal(await loadAuthProfile('nope'), null);
});

test('loadAuthProfile serves a cached profile without hitting the database', async () => {
  const store = new Map();
  redisStore = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v); },
    del: async (k) => { store.delete(k); },
  };
  await loadAuthProfile('u-1');
  assert.equal(queryCalls.length, 1);
  await loadAuthProfile('u-1');
  assert.equal(queryCalls.length, 1, 'second call must be served from cache');
});

test('invalidateAuthProfile forces the next read back to the database', async () => {
  const store = new Map();
  redisStore = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v); },
    del: async (k) => { store.delete(k); },
  };
  await loadAuthProfile('u-1');
  await invalidateAuthProfile('u-1');
  await loadAuthProfile('u-1');
  assert.equal(queryCalls.length, 2);
});

test('loadAuthProfile survives a broken redis', async () => {
  redisStore = {
    get: async () => { throw new Error('redis down'); },
    set: async () => { throw new Error('redis down'); },
    del: async () => { throw new Error('redis down'); },
  };
  assert.deepEqual(await loadAuthProfile('u-1'), PROFILE);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd backend
node --test test/authProfile.test.js
```
Expected: FAIL — `Cannot find module '../utils/authProfile'`.

- [ ] **Step 3: Write `utils/authProfile.js`**

```js
// Resolves the caller's profile row for req.user.
//
// Supabase owns identity; public.users owns the profile. Routes read
// req.user.full_name / req.user.username, and those must come from the profile
// table rather than the JWT's user_metadata snapshot, which goes stale as soon as
// someone edits their profile (and never carries `username` at all).
//
// Cached in Redis for 60s, mirroring the utils/authTokenVersion.js pattern this
// module replaces — no new infrastructure, no net extra per-request DB traffic.

const { query } = require('../config/database');
const { getRedis } = require('../config/redis');

const TTL_SECONDS = 60;
const keyFor = (userId) => `auth:profile:${userId}`;

const loadAuthProfile = async (userId) => {
  if (!userId) return null;
  const redis = getRedis();

  if (redis) {
    const cached = await redis.get(keyFor(userId)).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through to the db */ }
    }
  }

  const result = await query(
    'SELECT id, email, username, full_name, avatar_url FROM users WHERE id = $1',
    [userId]
  );
  const profile = result.rows[0] || null;

  if (redis && profile) {
    await redis.set(keyFor(userId), JSON.stringify(profile), 'EX', TTL_SECONDS).catch(() => {});
  }
  return profile;
};

const invalidateAuthProfile = async (userId) => {
  const redis = getRedis();
  if (redis && userId) await redis.del(keyFor(userId)).catch(() => {});
};

module.exports = { loadAuthProfile, invalidateAuthProfile };
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd backend
node --test test/authProfile.test.js
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Rewrite `backend/middleware/auth.js`**

Replace the whole file:

```js
// Authenticates requests with Supabase Auth access tokens.
//
// Supabase owns sessions, refresh, and revocation, so there is no tokenVersion
// freshness check any more — a revoked session simply stops producing valid
// access tokens. Profile fields beyond id/email are read from public.users
// rather than trusted from the token's user_metadata.

const { verifySupabaseToken } = require('../utils/supabaseJwt');
const { loadAuthProfile } = require('../utils/authProfile');

const bearerFrom = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
};

const resolveUser = async (req) => {
  const token = bearerFrom(req);
  if (!token) return null;
  const payload = await verifySupabaseToken(token);
  const profile = await loadAuthProfile(payload.sub);
  if (!profile) {
    const error = new Error('No profile for this identity.');
    error.code = 'PROFILE_MISSING';
    throw error;
  }
  return {
    id: profile.id,
    email: profile.email || payload.email || null,
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url || null,
  };
};

const requireAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: 'No valid access token provided.', code: 'AUTH_REQUIRED' });
    req.user = user;
    return next();
  } catch (error) {
    const message = error.code === 'ERR_JWT_EXPIRED'
      ? 'Access token expired.'
      : error.code === 'PROFILE_MISSING'
        ? 'Your account is still being set up. Please try again in a moment.'
        : 'Invalid access token.';
    return res.status(401).json({ error: message, code: 'AUTH_REQUIRED' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
  } catch { /* anonymous access is fine here */ }
  next();
};

module.exports = { requireAuth, optionalAuth };
```

- [ ] **Step 6: Register the test and confirm the suite is green**

Append ` test/authProfile.test.js` to the `test` script list in `backend/package.json:18`, then:

```bash
cd backend
npm test
```
Expected: PASS. `test/githubOauth.test.js` still passes at this point (passport is untouched until Task 6).

- [ ] **Step 7: Commit**

```bash
git add backend/utils/authProfile.js backend/test/authProfile.test.js backend/middleware/auth.js backend/package.json
git commit -m "feat(auth): verify Supabase JWTs and resolve profiles in requireAuth"
```

---

### Task 5: Trim `routes/auth.js`

**Files:**
- Modify: `backend/routes/auth.js`
- Delete: `backend/utils/tokens.js`, `backend/utils/authTokenVersion.js`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `invalidateAuthProfile` (Task 4).
- Produces: `GET /api/auth/me` and `PUT /api/auth/profile` only. `POST /register|login|refresh|logout|logout-all` and `PUT /change-password|change-email` cease to exist; the frontend calls Supabase directly for all of them (Tasks 8–10).

- [ ] **Step 1: Confirm nothing else imports the modules being deleted**

```bash
cd backend
grep -rn "utils/tokens\|authTokenVersion" --include=*.js routes middleware config utils jobs scripts test server.js worker.js
```
Expected after this task's edit: only `routes/auth.js` appears, and only until Step 2 removes it. If any other file appears, stop and reconcile before deleting.

- [ ] **Step 2: Edit `backend/routes/auth.js`**

Replace the header block (lines 1–10) with:

```js
// backend/routes/auth.js
//
// Supabase Auth owns registration, login, refresh, logout, password changes, and
// email changes — the SPA calls GoTrue directly for all of them. What is left here
// is the profile surface that lives in public.users.
const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { invalidateAuthProfile } = require('../utils/authProfile');
const { validateSchema, s } = require('../middleware/schemaValidation');
const { userQuota } = require('../middleware/userQuotas');
require('dotenv').config();
```

Then delete these blocks entirely:
- `registerSchema`, `loginSchema`, `changePasswordSchema`, `changeEmailSchema` (lines 29–49)
- `makeUsername` (lines 51–54)
- `POST /register` (lines 56–110)
- `POST /login` (lines 112–151)
- `POST /refresh` (lines 153–162)
- `POST /logout` (lines 164–167)
- `PUT /change-password` (lines 231–248)
- `PUT /change-email` (lines 250–267)
- `POST /logout-all` (lines 269–278)

Keep `profileSchema`, `GET /me`, `PUT /profile`, and `module.exports = router`.

- [ ] **Step 3: Invalidate the profile cache after a profile edit**

In the surviving `PUT /profile` handler, immediately after the `UPDATE users …` query resolves and before `res.json(...)`, add:

```js
    // req.user is served from a 60s cache; a profile edit must be visible at once.
    await invalidateAuthProfile(req.user.id);
```

- [ ] **Step 4: Delete the obsolete modules**

```bash
cd backend
git rm utils/tokens.js utils/authTokenVersion.js
```

- [ ] **Step 5: Verify the router still loads and the suite is green**

```bash
cd backend
node -e "require('./routes/auth.js'); console.log('auth router loads')"
npm test
```
Expected: `auth router loads`, then PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/auth.js
git commit -m "refactor(auth): hand register/login/refresh/password to Supabase, keep the profile routes"
```

---

### Task 6: Strip Passport and rewire `server.js`

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/routes/analytics.js:30`
- Modify: `backend/test/scalability.test.js` (around line 69)
- Modify: `backend/scripts/verifyScalability.js` (around line 25)
- Modify: `backend/package.json` (deps + test list)
- Delete: `backend/config/passport.js`, `backend/routes/oauth.js`, `backend/test/githubOauth.test.js`

**Interfaces:**
- Consumes: `subjectFromToken` (Task 1).
- Produces: a server that boots with no `JWT_SECRET` / `SESSION_SECRET` and refuses to boot in production without `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

**Why the scalability files matter:** they are text-matching guard rails over files this task deletes. Four checks are affected:

| Where | Check | Why it breaks |
|---|---|---|
| `test/scalability.test.js:68-74` | reads `config/passport.js` for `state: true` and `email_verified` | file deleted → `ENOENT` throw, and this file is in `npm test` |
| `scripts/verifyScalability.js:25` | same passport assertions | file deleted → `ENOENT` throw |
| `scripts/verifyScalability.js:11` | `/token_hash/.test(read('utils/tokens.js'))` | deleted in Task 5 → `ENOENT` throw |
| `scripts/verifyScalability.js:12` | `/SessionRedisStore/.test(read('server.js'))` | Step 4 removes it → check fails |

The properties those checks defended (CSRF `state` on the OAuth handshake, rejecting unverified provider emails, hashed refresh tokens at rest, Redis-backed sessions) are all Supabase's responsibility now. The replacements assert the app did not leave a second, weaker path behind.

Leave `scalability.test.js:23` (`assert.doesNotMatch(read('middleware/auth.js'), /config\/database/)`) and `verifyScalability.js:10` alone — both still pass. The new `middleware/auth.js` reaches the database only indirectly through `utils/authProfile`, exactly as the old one did through `utils/authTokenVersion`, and with the same Redis cache in front of it.

- [ ] **Step 1: Write the failing test**

In `backend/test/scalability.test.js`, replace the whole `test('oauth providers use session-backed state and verified email checks', …)` block at lines 68-74 with:

```js
test('the app ships no first-party OAuth handshake or token issuer', () => {
  // OAuth state/CSRF and provider email verification are Supabase Auth's job now.
  // What this asserts is that no second, weaker path was left behind.
  const root = path.join(__dirname, '..');
  for (const gone of ['config/passport.js', 'routes/oauth.js', 'utils/tokens.js', 'utils/authTokenVersion.js']) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} must be gone`);
  }
  const server = read('server.js');
  assert.doesNotMatch(server, /require\(['"]\.\/config\/passport['"]\)/, 'server.js must not load passport');
  assert.doesNotMatch(server, /passport\.(initialize|session)\(\)/, 'server.js must not mount passport');
  const middleware = read('middleware/auth.js');
  assert.match(middleware, /verifySupabaseToken/, 'requireAuth must verify Supabase tokens');
  assert.doesNotMatch(middleware, /jsonwebtoken/, 'requireAuth must not verify first-party JWTs');
});
```

`fs`, `path`, and the `read()` helper are already declared at lines 2-3 and 8 of that file, and `read()` already resolves relative to `backend/` — nothing else to add.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend
node --test test/scalability.test.js
```
Expected: FAIL — `config/passport.js must be gone`.

- [ ] **Step 3: Update `scripts/verifyScalability.js`**

Add an `exists` helper directly below the existing `read` helper on line 5:

```js
const exists = (relative) => fs.existsSync(path.join(root, relative));
```

Replace the check on line 11:

```js
  ['refresh tokens are hashed', () => /token_hash/.test(read('utils/tokens.js'))],
```

with:

```js
  ['session lifecycle is delegated to supabase auth', () => !exists('utils/tokens.js') && !exists('utils/authTokenVersion.js')],
```

Replace the check on line 12:

```js
  ['sessions can use Redis', () => /SessionRedisStore/.test(read('server.js'))],
```

with:

```js
  ['auth profile lookups can use Redis', () => /getRedis/.test(read('utils/authProfile.js'))],
```

Replace the check on line 25:

```js
  ['oauth uses state and verified email checks', () => /state:\s*true/.test(read('config/passport.js')) && /email_verified/.test(read('config/passport.js'))],
```

with:

```js
  ['oauth is delegated to supabase auth', () => !exists('config/passport.js') && !exists('routes/oauth.js') && /verifySupabaseToken/.test(read('middleware/auth.js'))],
```

- [ ] **Step 4: Edit `backend/server.js`**

Remove these imports (lines 9, 10, 13, 14):

```js
const session = require('express-session');
const { RedisStore: SessionRedisStore } = require('connect-redis');
const passport = require('./config/passport');
const jwt = require('jsonwebtoken');
```

and add:

```js
const { subjectFromToken } = require('./utils/supabaseJwt');
```

Replace the `pollingLimiter` `keyGenerator` (lines 76–86) with:

```js
  // express-rate-limit v7 awaits a promise-returning keyGenerator. Verifying the
  // token (rather than decoding it) matters: an unverified `sub` would let anyone
  // drain someone else's bucket. JWKS is cached in-process, so this is not a
  // network round trip per request.
  keyGenerator: async (req) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const sub = await subjectFromToken(header.slice(7).trim());
      if (sub) return `user:${sub}`;
    }
    return `ip:${normalizeIpForRateLimit(req.ip)}`;
  },
```

Delete the session + passport block (lines 111–125) entirely:

```js
app.use(session({ ... }));
app.use(passport.initialize());
app.use(passport.session());
```

Delete the OAuth router mount (line 177):

```js
app.use('/api/auth', require('./routes/oauth'));
```

Replace the production boot checks (lines 206–211) with:

```js
  if (process.env.NODE_ENV === 'production') {
    const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter((name) => !process.env[name]);
    if (missing.length) {
      throw new Error(`Production requires ${missing.join(', ')} for Supabase Auth.`);
    }
    if (!process.env.METRICS_TOKEN) throw new Error('Production requires METRICS_TOKEN.');
    if (!process.env.ANALYTICS_VISITOR_SECRET) {
      throw new Error('Production requires ANALYTICS_VISITOR_SECRET.');
    }
  }
```

Finally, extend `/health/ready` so a missing trigger is a deployment-visible failure rather than a silent one. Replace the `schema` query (lines 147–152) with:

```js
    const schema = await query({
      name: 'health-ready',
      text: `SELECT
        (SELECT COUNT(*)::int FROM schema_migrations) AS migration_count,
        (SELECT COUNT(*)::int FROM schema_migration_warnings) AS warning_count,
        (SELECT COUNT(*)::int FROM pg_trigger
          WHERE tgname IN ('on_auth_user_created', 'on_auth_user_email_sync')) AS auth_trigger_count`,
    });
```

and immediately after the `warningsFatal` check, add:

```js
    // Without these, signups land in auth.users with no profile and every
    // subsequent authed request 401s with PROFILE_MISSING.
    if (schema.rows[0].auth_trigger_count < 2) {
      return res.status(503).json({
        status: 'not_ready',
        database: 'degraded',
        error: 'Supabase Auth profile triggers are missing; run npm run db:migrate.',
      });
    }
```

and add `auth_triggers: schema.rows[0].auth_trigger_count` to the success payload.

- [ ] **Step 5: Drop the `JWT_SECRET` fallback in analytics**

In `backend/routes/analytics.js:30`, change:

```js
  const secret = process.env.ANALYTICS_VISITOR_SECRET || process.env.JWT_SECRET;
```

to:

```js
  const secret = process.env.ANALYTICS_VISITOR_SECRET;
```

- [ ] **Step 6: Delete the obsolete modules and their test**

```bash
cd backend
git rm config/passport.js routes/oauth.js test/githubOauth.test.js
```

- [ ] **Step 7: Update `backend/package.json`**

Remove ` test/githubOauth.test.js` from the `test` script list (line 18), then:

```bash
cd backend
npm uninstall passport passport-github2 passport-google-oauth20 passport-openidconnect express-session connect-redis jsonwebtoken
```

**Do not remove `bcryptjs`** yet — nothing imports it after Task 5, but leaving it until Task 13's cleanup keeps the rollback path (reverting the code redeploy) installable. Remove it in Task 13 Step 6.

- [ ] **Step 8: Verify**

```bash
cd backend
grep -rn "passport\|express-session\|connect-redis\|jsonwebtoken" --include=*.js routes middleware config utils jobs scripts test server.js worker.js
npm test
npm run verify:scalability
```
Expected: the grep returns nothing; `npm test` PASSes; `verify:scalability` reports every check passing (it is pure static text matching and needs no running instance).

- [ ] **Step 9: Commit**

```bash
git add -A backend
git commit -m "refactor(auth): remove passport, sessions, and first-party JWTs from the server"
```

---

### Task 7: Give the AI browser verifier a real Supabase session

`routes/agent.js:1226-1249` mints `jwt.sign({ userId }, JWT_SECRET)` and `utils/agentBrowserVerifier.js` injects it as `localStorage.token`. After Task 6 that token is unverifiable, and after Task 8 the SPA no longer reads that storage key. Left alone, authenticated-route verification silently runs logged-out and reports false failures for every agent run.

**Files:**
- Create: `backend/utils/supabaseAdmin.js`
- Modify: `backend/routes/agent.js:1206-1254`
- Modify: `backend/utils/agentBrowserVerifier.js` (the two `auth` blocks near lines 930-940 and 1105-1120, and the `includeDashboard` guard near line 1030)
- Test: `backend/test/supabaseAdmin.test.js`
- Modify: `backend/package.json` (add `@supabase/supabase-js`, test list)

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `getSupabaseAdmin() → SupabaseClient | null` and `createVerifierLoginLink(email, redirectTo) → Promise<string|null>` — a single-use magic link that, when navigated to, establishes a real Supabase session in the browser context. Returns `null` (rather than throwing) when the service-role key is absent, so verification degrades to public-routes-only exactly as it does today when `JWT_SECRET` is unset. `agentBrowserVerifier` now accepts `auth = { loginUrl }` instead of `auth = { token, user }`.

- [ ] **Step 1: Install the client**

```bash
cd backend
npm install @supabase/supabase-js@^2.47.10
```

- [ ] **Step 2: Write the failing test**

Create `backend/test/supabaseAdmin.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createVerifierLoginLink, resetSupabaseAdmin } = require('../utils/supabaseAdmin');

test.beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSupabaseAdmin();
});

test('createVerifierLoginLink returns null when the service role key is absent', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  assert.equal(await createVerifierLoginLink('a@b.com', 'http://localhost:3000'), null);
});

test('createVerifierLoginLink returns null when the url is absent', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  assert.equal(await createVerifierLoginLink('a@b.com', 'http://localhost:3000'), null);
});

test('createVerifierLoginLink returns null instead of throwing when generateLink fails', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  resetSupabaseAdmin({
    auth: { admin: { generateLink: async () => ({ data: null, error: new Error('nope') }) } },
  });
  assert.equal(await createVerifierLoginLink('a@b.com', 'http://localhost:3000'), null);
});

test('createVerifierLoginLink returns the action link on success', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  let seen = null;
  resetSupabaseAdmin({
    auth: {
      admin: {
        generateLink: async (options) => {
          seen = options;
          return { data: { properties: { action_link: 'https://example.supabase.co/auth/v1/verify?token=abc' } }, error: null };
        },
      },
    },
  });
  const link = await createVerifierLoginLink('a@b.com', 'http://localhost:3000/auth/callback');
  assert.equal(link, 'https://example.supabase.co/auth/v1/verify?token=abc');
  assert.equal(seen.type, 'magiclink');
  assert.equal(seen.email, 'a@b.com');
  assert.equal(seen.options.redirectTo, 'http://localhost:3000/auth/callback');
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd backend
node --test test/supabaseAdmin.test.js
```
Expected: FAIL — `Cannot find module '../utils/supabaseAdmin'`.

- [ ] **Step 4: Write `backend/utils/supabaseAdmin.js`**

```js
// Service-role Supabase client for the few things the backend must do as an admin.
//
// Today that is exactly one thing: minting a short-lived login link so the AI site
// agent's Puppeteer verifier can load the authenticated dashboard/preview routes as
// the user whose portfolio it is checking. This replaces a self-signed JWT that the
// app used to mint and inject into localStorage — Supabase owns sessions now, and
// the SPA only trusts sessions Supabase issued.

const logger = require('./logger');

let client = null;
let configuredFor = null;

const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (client && configuredFor === `${url}:${serviceKey}`) return client;

  const { createClient } = require('@supabase/supabase-js');
  client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  configuredFor = `${url}:${serviceKey}`;
  return client;
};

// Test seam: pass a stub to install it, pass nothing to clear the cached client.
const resetSupabaseAdmin = (stub = null) => {
  client = stub;
  configuredFor = stub
    ? `${process.env.SUPABASE_URL}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    : null;
};

// Returns a single-use magic link, or null when admin credentials are unavailable
// or Supabase refuses. Callers degrade to unauthenticated verification on null —
// the same behaviour the old code had when JWT_SECRET was unset.
const createVerifierLoginLink = async (email, redirectTo) => {
  if (!email) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error || !data?.properties?.action_link) {
      logger.warn({ err: error?.message }, 'Could not mint an agent verifier login link');
      return null;
    }
    return data.properties.action_link;
  } catch (error) {
    logger.warn({ err: error.message }, 'Could not mint an agent verifier login link');
    return null;
  }
};

module.exports = { getSupabaseAdmin, createVerifierLoginLink, resetSupabaseAdmin };
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
cd backend
node --test test/supabaseAdmin.test.js
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Rewire `backend/routes/agent.js`**

At the top of the file, remove `const jwt = require('jsonwebtoken');` (line 2) and add:

```js
const { createVerifierLoginLink } = require('../utils/supabaseAdmin');
```

In `runLiveVerificationForUser` (line 1206), replace the `auth:` property:

```js
      auth: liveTarget.user && process.env.JWT_SECRET ? {
        token: jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '10m' }),
        user: liveTarget.user,
      } : null,
```

with:

```js
      auth: await verifierAuth(liveTarget.user),
```

Apply the identical replacement in `runPreviewVerificationForUser` (line 1236). Then add this helper immediately above `runLiveVerificationForUser`:

```js
// The verifier signs in through a real single-use Supabase magic link instead of a
// self-minted token: the SPA only accepts sessions Supabase issued. Null here means
// verification runs against public routes only, exactly as it did when JWT_SECRET
// was unset.
const verifierAuth = async (user) => {
  if (!user?.email) return null;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const loginUrl = await createVerifierLoginLink(user.email, `${frontendUrl}/auth/callback`);
  return loginUrl ? { loginUrl, user } : null;
};
```

No change is needed in `loadLiveVerificationTarget` — its SELECT already includes `u.email` (line 1175) and copies it onto `liveTarget.user` (line 1197).

- [ ] **Step 7: Rewire `backend/utils/agentBrowserVerifier.js`**

There are two `evaluateOnNewDocument` blocks that inject `localStorage`. Replace both.

At roughly line 933:

```js
        if (auth?.token && auth?.user) {
          await page.evaluateOnNewDocument((token, user) => {
            window.localStorage.setItem('token', token);
            window.localStorage.setItem('user', JSON.stringify(user));
          }, auth.token, auth.user);
        }
```

becomes:

```js
        if (auth?.loginUrl) {
          // Consume the magic link once; supabase-js persists the resulting session
          // for every later navigation in this browser context.
          await page.goto(auth.loginUrl, { waitUntil: 'networkidle2' });
        }
```

At roughly line 1110:

```js
        if (target.protected && auth?.token && auth?.user) {
          await page.evaluateOnNewDocument((token, user) => {
            window.localStorage.setItem('token', token);
            window.localStorage.setItem('user', JSON.stringify(user));
          }, auth.token, auth.user);
        }
```

becomes:

```js
        if (target.protected && auth?.loginUrl && !authApplied) {
          // The link is single-use, so consume it for the first protected target
          // only; the session persists in this browser context afterwards.
          await page.goto(auth.loginUrl, { waitUntil: 'networkidle2' });
          authApplied = true;
        }
```

Declare `let authApplied = false;` in the enclosing function scope, above the loop that iterates targets.

At roughly line 1030, update the guard:

```js
    includeDashboard: options.includeDashboard === true && Boolean(auth?.token && auth?.user),
```

becomes:

```js
    includeDashboard: options.includeDashboard === true && Boolean(auth?.loginUrl),
```

- [ ] **Step 8: Verify no `auth.token` reference survives, and run the suite**

```bash
cd backend
grep -rn "auth?.token\|auth\.token\|localStorage.setItem('token'" utils/agentBrowserVerifier.js routes/agent.js
npm test
```
Expected: the grep returns nothing; `npm test` PASSes (`agentBrowserVerifier.test.js` and `agentRoute.test.js` included). If either test asserts on the old `{ token, user }` shape, update those assertions to the `{ loginUrl, user }` shape.

- [ ] **Step 9: Register the test and commit**

Append ` test/supabaseAdmin.test.js` to the `test` script list in `backend/package.json:18`.

```bash
git add -A backend
git commit -m "fix(agent): authenticate the browser verifier with a real Supabase session"
```

---

### Task 8: Frontend Supabase client, `useAuth`, and `api.js`

**Files:**
- Create: `frontend/src/lib/supabase.js`
- Test: `frontend/src/lib/supabase.test.js`
- Modify: `frontend/src/hooks/useAuth.jsx`, `frontend/src/utils/api.js`, `frontend/vite.config.js`, `frontend/vitest.config.js`, `frontend/package.json`

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Produces: `supabase` (default + named export from `@/lib/supabase`). `useAuth()` now returns `{ user, session, loading, signInWithPassword, signUp, signInWithOAuth, signOut, updateUser, refreshProfile }`. **`login` and `register` are gone** — Tasks 9–11 call the new names. `user` is the merged `/auth/me` profile (same shape pages already consume), `session` is the raw Supabase session.

- [ ] **Step 1: Install the client**

```bash
cd frontend
npm install @supabase/supabase-js@^2.47.10
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/supabase.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createClient = vi.fn(() => ({ auth: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('supabase client', () => {
  beforeEach(() => {
    createClient.mockClear();
    vi.resetModules();
  });

  it('configures persistence, auto-refresh, URL detection, and PKCE', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    await import('./supabase');
    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClient.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co');
    expect(key).toBe('anon-key');
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.detectSessionInUrl).toBe(true);
    expect(options.auth.flowType).toBe('pkce');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd frontend
npx vitest run src/lib/supabase.test.js
```
Expected: FAIL — cannot resolve `./supabase`.

- [ ] **Step 4: Write `frontend/src/lib/supabase.js`**

```js
// The single Supabase Auth client for the SPA.
//
// supabase-js owns the session: it persists it, refreshes it ahead of expiry, and
// picks it up out of the URL after an OAuth / confirm-email / recovery redirect.
// utils/api.js reads the current access token off this client for every API call,
// so nothing else should touch session storage directly.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Loud in dev, harmless in prod builds where the vars are always injected.
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for auth to work.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE is the correct flow for a public browser client and is what the
    // /auth/callback route in Tasks 9-11 exchanges.
    flowType: 'pkce',
  },
});

export default supabase;
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
cd frontend
npx vitest run src/lib/supabase.test.js
```
Expected: PASS.

- [ ] **Step 6: Rewrite `frontend/src/hooks/useAuth.jsx`**

```jsx
// frontend/src/hooks/useAuth.jsx
//
// Supabase owns the session; this hook mirrors it into React and pairs it with the
// application profile from GET /auth/me (username, headline, skills, portfolio
// settings — none of which live in the Supabase JWT).
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../lib/supabase';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      return res.data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      sessionRef.current = data.session;
      setSession(data.session);
      if (data.session) await loadProfile();
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!active) return;
      // TOKEN_REFRESHED fires on every silent refresh; the profile has not changed,
      // so do not re-fetch it and do not flip `loading` back on.
      const sameUser = sessionRef.current?.user?.id === nextSession?.user?.id;
      sessionRef.current = nextSession;
      setSession(nextSession);
      if (!nextSession) {
        setUser(null);
      } else if (!sameUser || event === 'SIGNED_IN') {
        await loadProfile();
      }
      setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signInWithPassword = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async ({ email, password, full_name, username }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, ...(username ? { username } : {}) },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    // With "Confirm email" on, Supabase returns a user but no session.
    return { ...data, needsEmailConfirmation: Boolean(data.user) && !data.session };
  }, []);

  const signInWithOAuth = useCallback(async (provider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setSession(null);
  }, []);

  // Optimistic local merge after a profile edit; the server is the source of truth.
  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => ({ ...(prev || {}), ...updatedUser }));
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      signInWithPassword, signUp, signInWithOAuth, signOut,
      updateUser, refreshProfile: loadProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 7: Rewrite the interceptors in `frontend/src/utils/api.js`**

Replace lines 22–63 (the request interceptor and the whole refresh-response interceptor) with:

```js
// Attach the current Supabase access token. getSession() reads from memory and
// refreshes ahead of expiry on its own, so there is no first-party refresh
// rotation to run here any more.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const url = String(config.url || '');
  if (url.startsWith('/agent/')) {
    config.timeout = Math.max(Number(config.timeout) || 0, AGENT_API_TIMEOUT_MS);
  }
  return config;
});

// A 401 now means the session is genuinely gone (revoked, or the refresh failed).
// Sign out locally and send the user to /login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || '').startsWith('/auth/')) {
      await supabase.auth.signOut().catch(() => {});
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

Add the import at the top of the file, below the axios import:

```js
import supabase from '../lib/supabase';
```

Leave `withCredentials: true` on the axios instance — it is unrelated to auth now, and other endpoints rely on the CORS credentials configuration.

- [ ] **Step 8: Add the vendor chunk**

In `frontend/vite.config.js`, inside `manualChunks`, add this line immediately **above** the `if (id.includes('react') || …)` block. The `react` test is a bare substring match and runs first otherwise; putting the supabase test ahead of it keeps the ordering safe if that block ever widens.

```js
          if (id.includes('@supabase')) return 'supabase';
```

- [ ] **Step 9: Provision the test environment**

`lib/supabase.js` calls `createClient()` at module load. Any test that imports a page transitively reaches it, and with no env vars present supabase-js throws `supabaseUrl is required.` — a module-load crash, not an assertion failure, so it takes the whole file down. `ProjectEditorPage.payload.test.jsx` hits this via `ProjectEditorPage.jsx`.

Add to `test:` in `frontend/vitest.config.js`, after the `include` line:

```js
    // lib/supabase.js builds its client at module load, so any test that imports
    // a page transitively reaches createClient() and would throw
    // "supabaseUrl is required." Tests never make a real Supabase call — these
    // only need to be syntactically valid. Set here rather than in .env so the
    // suite does not depend on a gitignored file.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
```

Config, not `.env`: `frontend/.env` is gitignored, so a suite that depended on it would be red on every fresh clone and in CI.

Then add the real values to `frontend/.env` for dev and for the Task 13 browser run (the **publishable** key — public by design, ships in the bundle; never the service role key):

```bash
VITE_SUPABASE_URL=https://dhzhtigowbvlmcrwvwix.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

- [ ] **Step 10: Verify**

```bash
cd frontend
npx vitest run src/lib/supabase.test.js
npm run build
npx vitest run
```
Expected: the supabase test PASSes, the build emits a `supabase-*.js` chunk, and the **full suite is green**.

Note: `LoginPage.test.jsx` / `RegisterPage.test.jsx` keep passing after this task even though the pages are not yet migrated — both files `vi.mock('../hooks/useAuth')`, so they never touch the real client. Task 9 rewrites them for the new flow regardless.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib frontend/src/hooks/useAuth.jsx frontend/src/utils/api.js frontend/vite.config.js frontend/vitest.config.js frontend/package.json frontend/package-lock.json
git commit -m "feat(auth): back the SPA session with supabase-js"
```

---

### Task 9: Login, Register, and the auth callback route

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`, `frontend/src/pages/RegisterPage.jsx`, `frontend/src/main.jsx`
- Create: `frontend/src/pages/AuthCallbackPage.jsx`, `frontend/src/pages/AuthCallbackPage.test.jsx`
- Modify: `frontend/src/pages/LoginPage.test.jsx`, `frontend/src/pages/RegisterPage.test.jsx`
- Delete: `frontend/src/pages/OAuthSuccessPage.jsx`

**Interfaces:**
- Consumes: `useAuth()`'s `signInWithPassword`, `signUp`, `signInWithOAuth` (Task 8).
- Produces: the route `/auth/callback` (replacing `/oauth-success`), which every Supabase `redirectTo` in this codebase points at.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/pages/LoginPage.test.jsx` entirely:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';

const signInWithOAuth = vi.fn().mockResolvedValue({});
const signInWithPassword = vi.fn().mockResolvedValue({});
const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signInWithPassword, signInWithOAuth }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('LoginPage', () => {
  it('starts a Supabase OAuth flow for each provider', async () => {
    render(<LoginPage />);
    for (const [label, provider] of [
      [/continue with google/i, 'google'],
      [/continue with linkedin/i, 'linkedin_oidc'],
      [/continue with github/i, 'github'],
    ]) {
      signInWithOAuth.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith(provider));
    }
  });

  it('signs in with email and password', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith('a@b.com', 'hunter22'));
  });
});
```

Replace `frontend/src/pages/RegisterPage.test.jsx` entirely:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './RegisterPage';

const signUp = vi.fn().mockResolvedValue({ needsEmailConfirmation: true });
const signInWithOAuth = vi.fn().mockResolvedValue({});

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ signUp, signInWithOAuth }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('RegisterPage', () => {
  it('signs up through Supabase with the full name as metadata', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Maya Iyer' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'maya@uni.edu' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      email: 'maya@uni.edu', password: 'hunter22', full_name: 'Maya Iyer',
    }));
  });

  it('shows the check-your-email state when confirmation is required', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Maya Iyer' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'maya@uni.edu' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });
});
```

Create `frontend/src/pages/AuthCallbackPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const navigate = vi.fn();
const getSession = vi.fn();
const exchangeCodeForSession = vi.fn();

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../lib/supabase', () => ({
  default: { auth: { getSession, exchangeCodeForSession } },
}));

import AuthCallbackPage from './AuthCallbackPage';

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    navigate.mockClear();
    getSession.mockReset();
    exchangeCodeForSession.mockReset();
    window.history.replaceState({}, '', '/auth/callback');
  });

  it('sends an established session to the dashboard', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('exchanges a PKCE code when one is present', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=abc123');
    getSession.mockResolvedValue({ data: { session: null } });
    exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('routes a recovery link to the reset page', async () => {
    window.history.replaceState({}, '', '/auth/callback#type=recovery&access_token=t');
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/reset-password', { replace: true }));
  });

  it('sends a failed callback back to login with an error flag', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=access_denied');
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login?error=oauth_failed', { replace: true }));
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

```bash
cd frontend
npx vitest run src/pages/LoginPage.test.jsx src/pages/RegisterPage.test.jsx src/pages/AuthCallbackPage.test.jsx
```
Expected: FAIL — the provider links are still `<a href>` elements, `useAuth` has no `signUp`, and `AuthCallbackPage` does not exist.

- [ ] **Step 3: Update `LoginPage.jsx`**

Replace the imports at lines 1–10 with:

```jsx
// frontend/src/pages/LoginPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { GoogleMark, LinkedInMark, GitHubMark } from '../components/shared/BrandMarks';

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', Mark: GoogleMark,
    className: 'border border-gray-200 text-gray-700 hover:bg-gray-50' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn', Mark: LinkedInMark,
    className: 'bg-[#0077B5] text-white hover:bg-[#006399]' },
  { id: 'github', label: 'Continue with GitHub', Mark: GitHubMark,
    className: 'bg-[#24292e] text-white hover:bg-[#1b1f23]' },
];
```

Replace the component's state/handlers (lines 12–31) with:

```jsx
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState(null);
  const { signInWithPassword, signInWithOAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithPassword(email, password);
      toast.success('Welcome back.');
      navigate('/dashboard');
    } catch (err) {
      // Supabase returns "Email not confirmed" as its own message; surface it as-is
      // so a user who never clicked the confirmation link knows what to do.
      toast.error(err?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setOauthPending(provider);
    try {
      // Resolves by navigating away; a rejection means we never left.
      await signInWithOAuth(provider);
    } catch (err) {
      toast.error(err?.message || 'Could not start that sign-in. Please try again.');
      setOauthPending(null);
    }
  };
```

Replace the three `<a href={oauthUrl(...)}>` blocks (lines 79–99) with:

```jsx
            {PROVIDERS.map(({ id, label, Mark, className }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleOAuth(id)}
                disabled={oauthPending === id}
                className={`flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${className}`}
              >
                <Mark className="w-4 h-4" />
                {oauthPending === id ? 'Redirecting...' : label}
              </button>
            ))}
```

- [ ] **Step 4: Update `RegisterPage.jsx`**

Replace the imports at lines 1–10 with the same `PROVIDERS` block as `LoginPage.jsx` (repeat it verbatim — the two pages do not share a module today and this plan does not introduce one):

```jsx
// frontend/src/pages/RegisterPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { GoogleMark, LinkedInMark, GitHubMark } from '../components/shared/BrandMarks';

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', Mark: GoogleMark,
    className: 'border border-gray-200 text-gray-700 hover:bg-gray-50' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn', Mark: LinkedInMark,
    className: 'bg-[#0077B5] text-white hover:bg-[#006399]' },
  { id: 'github', label: 'Continue with GitHub', Mark: GitHubMark,
    className: 'bg-[#24292e] text-white hover:bg-[#1b1f23]' },
];
```

Replace the state/handlers (lines 12–35) with:

```jsx
export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const { signUp, signInWithOAuth } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      return toast.error('Password must be at least 8 characters.');
    }
    setLoading(true);
    try {
      const result = await signUp(form);
      if (result.needsEmailConfirmation) {
        setSentTo(form.email);
      } else {
        toast.success('Account created. Welcome to ProjectFolio.');
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error(err?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setOauthPending(provider);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      toast.error(err?.message || 'Could not start that sign-in. Please try again.');
      setOauthPending(null);
    }
  };
```

Replace the three `<a href={oauthUrl(...)}>` blocks (lines 83–103) with the same `PROVIDERS.map(...)` block used in `LoginPage.jsx` (repeat it verbatim).

Then, immediately inside the `<div className="w-full max-w-md">` that opens at line 68, add the confirmation state ahead of the heading:

```jsx
          {sentTo && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h2 className="text-base font-semibold text-gray-900">Check your email</h2>
              <p className="mt-1 text-sm text-gray-700">
                We sent a confirmation link to <span className="font-medium">{sentTo}</span>.
                Click it to finish setting up your account, then sign in.
              </p>
            </div>
          )}
```

- [ ] **Step 5: Create `frontend/src/pages/AuthCallbackPage.jsx`**

```jsx
// Single landing route for every Supabase redirect: OAuth, email confirmation,
// and password recovery. supabase-js with detectSessionInUrl handles the implicit
// fragment automatically; the PKCE `?code=` form needs an explicit exchange.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      if (params.get('error') || hash.get('error')) {
        if (!cancelled) navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      let { data } = await supabase.auth.getSession();
      const code = params.get('code');
      if (!data.session && code) {
        const exchanged = await supabase.auth.exchangeCodeForSession(code);
        if (exchanged.error) {
          if (!cancelled) navigate('/login?error=oauth_failed', { replace: true });
          return;
        }
        data = exchanged.data;
      }
      if (cancelled) return;

      if (!data.session) {
        navigate('/login?error=oauth_failed', { replace: true });
        return;
      }

      // Strip the tokens/code out of the address bar before going anywhere else.
      window.history.replaceState({}, document.title, window.location.pathname);

      const isRecovery = hash.get('type') === 'recovery' || params.get('type') === 'recovery';
      navigate(isRecovery ? '/reset-password' : '/dashboard', { replace: true });
    };

    finish();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-ink-muted text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Swap the route in `frontend/src/main.jsx`**

Line 26 becomes:

```jsx
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
```

Line 115 becomes:

```jsx
            <Route path="/auth/callback" element={<PageTransition><AuthCallbackPage /></PageTransition>} />
```

- [ ] **Step 7: Delete the old page**

```bash
cd frontend
git rm src/pages/OAuthSuccessPage.jsx
```

- [ ] **Step 8: Run the tests and confirm they pass**

```bash
cd frontend
npx vitest run src/pages/LoginPage.test.jsx src/pages/RegisterPage.test.jsx src/pages/AuthCallbackPage.test.jsx
grep -rn "oauth-success\|OAuthSuccess\|/auth/oauth/exchange" src/
```
Expected: 8 tests PASS; the grep returns nothing.

- [ ] **Step 9: Commit**

```bash
git add -A frontend
git commit -m "feat(auth): sign in and register through Supabase, add /auth/callback"
```

---

### Task 10: Account settings — email and password changes

**Files:**
- Modify: `frontend/src/pages/AccountSettingsPage.jsx`
- Test: `frontend/src/pages/AccountSettingsPage.test.jsx` (create)

**Interfaces:**
- Consumes: `supabase.auth.updateUser`, `supabase.auth.signInWithPassword` (for reauthentication), `useAuth().signOut`.
- Produces: no new exports.

**Behaviour change to be explicit about:** email changes now go through Supabase's confirmation email — the address does **not** change until the user clicks the link, at which point the Task 2 trigger syncs `public.users.email`. The old code changed it immediately. Copy must say so.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/AccountSettingsPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateUser = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();

vi.mock('../lib/supabase', () => ({
  default: { auth: { updateUser, signInWithPassword } },
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'old@b.com' }, signOut }),
}));
vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import AccountSettingsPage from './AccountSettingsPage';

describe('AccountSettingsPage', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  });

  it('requests an email change through Supabase', async () => {
    render(<AccountSettingsPage />);
    fireEvent.change(screen.getByLabelText(/new email/i), { target: { value: 'new@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send confirmation/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ email: 'new@b.com' }));
  });

  it('reauthenticates before changing the password', async () => {
    render(<AccountSettingsPage />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'old@b.com', password: 'old-pass',
    }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'new-pass-1' }));
  });

  it('does not change the password when the current one is wrong', async () => {
    signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    render(<AccountSettingsPage />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    expect(updateUser).not.toHaveBeenCalled();
  });
});
```

These tests use `getByLabelText`, and the page's labels currently carry **no** `htmlFor`/`id` pairing — Step 3 adds it. Without that, all three tests fail on "Found a label with the text of: …, however no form control was found associated to that label."

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd frontend
npx vitest run src/pages/AccountSettingsPage.test.jsx
```
Expected: FAIL — the page still calls `api.put('/auth/change-email')`.

- [ ] **Step 3: Update the handlers in `AccountSettingsPage.jsx`**

Change the imports at lines 1–5 to:

```jsx
import { useState } from 'react';
import DashboardLayout from '../components/shared/DashboardLayout';
import { useAuth } from '../hooks/useAuth';
import supabase from '../lib/supabase';
import toast from 'react-hot-toast';
```

Change the state at lines 9–10 to:

```jsx
  const [emailForm, setEmailForm] = useState({ new_email: '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
```

Replace `handleEmailChange` (lines 32–47) with:

```jsx
  const handleEmailChange = async (e) => {
    e.preventDefault();
    if (!emailForm.new_email) return toast.error('Please enter a new email address.');
    setSavingEmail(true);
    try {
      // Supabase mails a confirmation link. The address does not change — and the
      // profile row is not synced — until that link is clicked.
      const { error } = await supabase.auth.updateUser({ email: emailForm.new_email });
      if (error) throw error;
      toast.success(`Confirmation sent to ${emailForm.new_email}. Click the link to finish the change.`);
      setEmailForm({ new_email: '' });
    } catch (err) {
      toast.error(err?.message || 'Failed to update email.');
    } finally {
      setSavingEmail(false);
    }
  };
```

Replace `handlePasswordChange` (lines 49–70) with:

```jsx
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      return toast.error('New passwords do not match.');
    }
    if (passwordForm.new_password.length < 8) {
      return toast.error('Password must be at least 8 characters.');
    }
    setSavingPassword(true);
    try {
      // updateUser({ password }) does not check the old password on its own, so
      // prove custody first — this is what the old change-password route did.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.current_password,
      });
      if (reauthError) {
        toast.error('Current password is incorrect.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: passwordForm.new_password });
      if (error) throw error;
      toast.success('Password changed successfully!');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err?.message || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };
```

Change the `useAuth()` destructure on line 8 from `const { user, logout } = useAuth();` to:

```jsx
  const { user } = useAuth();
```

`logout` was only used by the old email handler, which signed the user out after an immediate address change. Supabase's flow does not sign anyone out, so the reference goes away.

- [ ] **Step 4: Rewrite the two form sections**

Replace the whole "Change email" section (lines 91-112) with:

```jsx
        {/* Change email */}
        <section className="p-6">
          <h3 className="font-semibold text-ink mb-1">Change email address</h3>
          <p className="text-sm text-ink-muted mb-5">
            We will email a confirmation link to the new address. Your address changes once you click it.
          </p>
          <form onSubmit={handleEmailChange} className="space-y-4">
            <div>
              <label htmlFor="account-new-email" className="form-label">New email address</label>
              <input id="account-new-email" type="email" value={emailForm.new_email}
                onChange={e => setEmailForm({ new_email: e.target.value })}
                placeholder="new@email.com" className="form-input" />
            </div>
            <button type="submit" disabled={savingEmail} className="btn-primary">
              {savingEmail ? 'Sending...' : 'Send confirmation'}
            </button>
          </form>
        </section>
```

Replace the whole "Change password" section (lines 114-141) with:

```jsx
        {/* Change password */}
        <section className="p-6">
          <h3 className="font-semibold text-ink mb-1">Change password</h3>
          <p className="text-sm text-ink-muted mb-5">Must be at least 8 characters.</p>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label htmlFor="account-current-password" className="form-label">Current password</label>
              <input id="account-current-password" type="password" value={passwordForm.current_password}
                onChange={e => setPasswordForm(f => ({ ...f, current_password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <div>
              <label htmlFor="account-new-password" className="form-label">New password</label>
              <input id="account-new-password" type="password" value={passwordForm.new_password}
                onChange={e => setPasswordForm(f => ({ ...f, new_password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <div>
              <label htmlFor="account-confirm-password" className="form-label">Confirm new password</label>
              <input id="account-confirm-password" type="password" value={passwordForm.confirm_password}
                onChange={e => setPasswordForm(f => ({ ...f, confirm_password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <button type="submit" disabled={savingPassword} className="btn-primary">
              {savingPassword ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </section>
```

Leave the "Current account" section at lines 84-89 untouched. Its `user?.google_id` / `user?.linkedin_id` chips are already inert today — `GET /auth/me` has never selected those columns — and this migration neither fixes nor worsens that. The columns themselves are deliberately **kept** by the Task 13 cleanup migration, so nothing here becomes newly broken.

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd frontend
npx vitest run src/pages/AccountSettingsPage.test.jsx
```
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AccountSettingsPage.jsx frontend/src/pages/AccountSettingsPage.test.jsx
git commit -m "feat(auth): change email and password through Supabase"
```

---

### Task 11: Password reset (addition beyond the spec — droppable)

Nothing else depends on this task. Skip it to hold scope exactly to the design spec — but note that the confirm-email gate ships with no recovery path otherwise, and the app has never had one.

**Files:**
- Create: `frontend/src/pages/ForgotPasswordPage.jsx`, `frontend/src/pages/ResetPasswordPage.jsx`
- Test: `frontend/src/pages/ForgotPasswordPage.test.jsx`
- Modify: `frontend/src/main.jsx` (two routes), `frontend/src/pages/LoginPage.jsx` (one link)

**Interfaces:**
- Consumes: `supabase.auth.resetPasswordForEmail`, `supabase.auth.updateUser`. `AuthCallbackPage` (Task 9) already routes `type=recovery` to `/reset-password`.
- Produces: routes `/forgot-password` and `/reset-password`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/ForgotPasswordPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const resetPasswordForEmail = vi.fn();
vi.mock('../lib/supabase', () => ({ default: { auth: { resetPasswordForEmail } } }));
vi.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ForgotPasswordPage from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  beforeEach(() => resetPasswordForEmail.mockReset().mockResolvedValue({ error: null }));

  it('sends a recovery email pointed at the auth callback', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'a@b.com',
      { redirectTo: `${window.location.origin}/auth/callback` },
    ));
  });

  it('confirms without revealing whether the account exists', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'nobody@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd frontend
npx vitest run src/pages/ForgotPasswordPage.test.jsx
```
Expected: FAIL — cannot resolve `./ForgotPasswordPage`.

- [ ] **Step 3: Create `frontend/src/pages/ForgotPasswordPage.jsx`**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import supabase from '../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err?.message || 'Could not send the reset email.');
      setLoading(false);
      return;
    }
    // Always the same message: whether an address is registered is not public.
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Reset your password</h1>
        {sent ? (
          <p className="text-gray-700 text-sm mt-4">
            If an account exists for that address, a reset link is on its way. The link
            expires in one hour.
          </p>
        ) : (
          <>
            <p className="text-gray-600 text-sm mb-6">
              Enter your email and we will send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="form-label">Email address</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@university.edu"
                  className="form-input"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <p className="text-sm text-gray-600 mt-6">
          <Link to="/login" className="text-blue-600 font-medium hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/pages/ResetPasswordPage.jsx`**

```jsx
// Reached from /auth/callback after a recovery link. Supabase has already put a
// short-lived recovery session in place by the time this renders, so updateUser
// is all that is needed.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import supabase from '../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Passwords do not match.');
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated. You are signed in.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err?.message || 'That reset link is no longer valid. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Choose a new password</h1>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label htmlFor="reset-password" className="form-label">New password</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 8 characters"
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="reset-confirm" className="form-label">Confirm new password</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
            {loading ? 'Saving...' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Register the routes and link them**

In `frontend/src/main.jsx`, next to the other `lazy(...)` declarations:

```jsx
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
```

and next to the `/auth/callback` route:

```jsx
            <Route path="/forgot-password" element={<PageTransition><ForgotPasswordPage /></PageTransition>} />
            <Route path="/reset-password" element={<PageTransition><ResetPasswordPage /></PageTransition>} />
```

In `frontend/src/pages/LoginPage.jsx`, directly below the password input's closing `</div>` in the form, add:

```jsx
            <p className="text-sm">
              <Link to="/forgot-password" className="text-blue-600 font-medium hover:underline">
                Forgot your password?
              </Link>
            </p>
```

- [ ] **Step 6: Run and commit**

```bash
cd frontend
npx vitest run
```
Expected: the whole frontend suite PASSes.

```bash
git add -A frontend
git commit -m "feat(auth): add password reset via Supabase recovery links"
```

---

### Task 12: Environment, deployment runbook, and the owner checklist

**Files:**
- Modify: `backend/.env.example`, `frontend/.env.example`, `DEPLOYMENT.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: every env name in Global Constraints.
- Produces: the dashboard checklist Task 13 executes.

- [ ] **Step 1: Update `backend/.env.example`**

Replace the JWT block (lines 32–36):

```bash
# JWT Secret (make this long and random - at least 32 characters)
JWT_SECRET=your_super_secret_jwt_key_make_this_very_long_and_random_12345
SESSION_SECRET=use_a_different_long_random_secret_for_sessions
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
```

with:

```bash
# ── Supabase Auth ────────────────────────────────────────────────────────────
# Supabase Auth (GoTrue) is the identity provider and token issuer. The API only
# VERIFIES tokens, using the project's public JWKS — there is no shared signing
# secret to configure and nothing to rotate here when Supabase rotates its keys.
# Project settings -> API. All three are required in production.
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
# Service role key: full admin, bypasses RLS. Server-side only, never shipped to
# the browser. Used to mint the AI agent verifier's login link.
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Delete the Google and GitHub OAuth blocks (lines 43–49) and replace with:

```bash
# Google / GitHub / LinkedIn OAuth credentials now live in the Supabase dashboard
# (Authentication -> Providers), not here. Each provider's console must allow
# https://<project-ref>.supabase.co/auth/v1/callback as a redirect URI.
```

In the observability block, change the `ANALYTICS_VISITOR_SECRET` comment to note it is now required in production (it no longer falls back to `JWT_SECRET`):

```bash
# Required in production. Previously fell back to JWT_SECRET, which no longer exists.
ANALYTICS_VISITOR_SECRET=replace_with_an_independent_random_secret
```

- [ ] **Step 2: Update `frontend/.env.example`**

Append:

```bash
# ── Supabase Auth ────────────────────────────────────────────────────────────
# Must point at the same project as the backend's SUPABASE_URL. The anon key is
# a public, RLS-scoped key and is meant to ship in the bundle — never put the
# service role key here.
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

- [ ] **Step 3: Add the runbook to `DEPLOYMENT.md`**

Append this section verbatim. Replace `<project-ref>` with `dhzhtigowbvlmcrwvwix`, `<app-domain>` with the production frontend origin, and `<api-domain>` with the production API origin.

````markdown
## Supabase Auth — one-time dashboard setup

Do all of this **before** deploying the code that expects it. Steps 1–4 are safe
to perform ahead of time: they change nothing for the current login system.

### 1. Email provider
Authentication → Providers → **Email**
- Enable email provider: **ON**
- Confirm email: **ON**
- Minimum password length: **8** (matches the app's client-side check)

Authentication → Emails → **SMTP Settings**
- Configure custom SMTP. Supabase's built-in sender is rate-limited to a few
  messages per hour and is not usable for real signups. Reuse the same
  credentials as `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASSWORD` in the backend env.

### 2. URL configuration
Authentication → **URL Configuration**
- Site URL: `https://<app-domain>`
- Redirect URLs (add every one):
  - `https://<app-domain>/auth/callback`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:5173/auth/callback`

Every `redirectTo` the app sends is `<origin>/auth/callback`. A missing entry here
makes OAuth fail with `redirect_to is not allowed` **after** the user has already
authorized at the provider — the most confusing failure mode in this migration.

### 3. Social providers
Authentication → Providers. For each of Google, GitHub, and LinkedIn (OIDC),
enable it and paste the client ID/secret from the app's existing OAuth apps
(previously `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `LINKEDIN_CLIENT_ID` in the
backend `.env`).

Then, in each provider's own console, add the Supabase callback to the allowed
redirect URIs — **in addition to**, not instead of, the existing app callback,
so a rollback still works:

| Provider | Console | Add this redirect URI |
|---|---|---|
| Google | console.cloud.google.com → Credentials → OAuth 2.0 Client | `https://<project-ref>.supabase.co/auth/v1/callback` |
| GitHub | github.com/settings/developers → OAuth Apps | `https://<project-ref>.supabase.co/auth/v1/callback` |
| LinkedIn | linkedin.com/developers → App → Auth | `https://<project-ref>.supabase.co/auth/v1/callback` |

LinkedIn must have the **Sign In with LinkedIn using OpenID Connect** product
enabled, with the `openid`, `profile`, and `email` scopes. Supabase's slug for it
is `linkedin_oidc`.

### 4. Environment variables
Set in the backend deployment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `ANALYTICS_VISITOR_SECRET` (now required — it no
longer falls back to `JWT_SECRET`).

Set in the frontend build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Both are found under Project Settings → API. The **anon** key is public and ships
in the JS bundle; the **service role** key is server-side only.

You may leave `JWT_SECRET` / `SESSION_SECRET` set during the rollback window —
nothing reads them, and keeping them means a code revert boots without an env change.

### 5. Verify the setup before cutover
```bash
curl -s https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
```
This must return a JSON object with a non-empty `keys` array. If it returns `{"keys":[]}`
the project is still on legacy HS256 signing, and `backend/utils/supabaseJwt.js`
(which is JWKS-only by design) will reject every token — migrate the project to
asymmetric keys under Project Settings → JWT Keys first.
````

- [ ] **Step 4: Update the Auth-model section of `CLAUDE.md`**

Replace the `### Auth model` paragraph with:

```markdown
### Auth model
Supabase Auth (GoTrue) is the sole identity provider and token issuer for
email/password and the Google / GitHub / LinkedIn (`linkedin_oidc`) social logins.
The SPA talks to GoTrue directly through `@supabase/supabase-js`
(`frontend/src/lib/supabase.js`), which owns session persistence and refresh, and
sends the resulting access token to the API as a bearer token.

The backend is a service-role BFF: `middleware/auth.js` verifies the token's ES256
signature against the project's public JWKS (`utils/supabaseJwt.js` — JWKS only,
no shared secret) and resolves the caller's profile from `public.users`
(`utils/authProfile.js`, Redis-cached 60s). There is no `tokenVersion` check any
more; Supabase owns revocation.

`public.users` is a **profile** table keyed by the same uuid as `auth.users`, with
`users.id → auth.users(id) ON DELETE CASCADE`. Two `SECURITY DEFINER` triggers on
`auth.users` keep them in sync: `on_auth_user_created` provisions the profile plus
default `portfolio_settings` on every signup regardless of path, and
`on_auth_user_email_sync` mirrors email/confirmation changes back. `/health/ready`
fails if either trigger is missing. RLS stays deny-all; the backend remains the
only data path for the SPA.
```

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example frontend/.env.example DEPLOYMENT.md CLAUDE.md
git commit -m "docs(auth): Supabase Auth env vars, dashboard runbook, and CLAUDE.md"
```

---

### Task 13: Cutover, verification, and cleanup

The only task that touches the live database or a deployed environment. Run it in order; do not skip the verification gate between the import and the cleanup migration.

**Files:**
- Create: `backend/migrations/013_supabase_auth_cleanup.sql`
- Modify: `backend/package.json` (drop `bcryptjs`)

**Interfaces:**
- Consumes: everything from Tasks 1–12.
- Produces: a migrated production database.

- [ ] **Step 1: Confirm the dashboard checklist is done**

Work through Task 12 Step 3 §1–§5 in the Supabase dashboard. Then, from a machine with the backend env loaded:

```bash
curl -s "$SUPABASE_URL/auth/v1/.well-known/jwks.json"
```
Expected: a JSON object with a non-empty `keys` array. Do not continue on `{"keys":[]}`.

- [ ] **Step 2: Apply the trigger and import migrations**

```bash
cd backend
npm run db:migrate
```
Expected: `Migration applied` for `011_supabase_auth_trigger.sql` and `012_supabase_auth_import.sql`.

If `012` fails on `permission denied for table users` (`42501`), the deploy role is not `postgres` — stop, and apply `011` and `012` through the Supabase SQL editor instead, then insert their filenames and checksums into `schema_migrations` manually so the runner does not retry them.

- [ ] **Step 3: Verify the import**

Run this against the project (Supabase SQL editor or `psql`):

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

Required results, given the pre-migration counts recorded in Global Constraints:
- `profiles = auth_users = 79`
- `unimported = 0`
- `unconfirmed = 0`
- **`null_string_rows = 0`** — anything else means logins will 500. Fix with
  `UPDATE auth.users SET confirmation_token = COALESCE(confirmation_token,''), …` for all eight columns before continuing.
- `email_identities = 78`, `social_identities = 4`
- `triggers = 2`, `fk = 1`

- [ ] **Step 4: Deploy backend and frontend together**

They must go out in the same window. The backend stops accepting legacy JWTs and the frontend stops issuing them; either one alone signs everybody out with no way back in.

After the deploy:

```bash
curl -s https://<api-domain>/health/ready
```
Expected: `"status":"ready"` (or `ready_with_warnings`) **and** `"auth_triggers":2`. A 503 mentioning missing triggers means Step 2 did not take.

- [ ] **Step 5: Verify the live flows**

Automated, with MCP Playwright against the deployed frontend:

1. **Migrated user, original password.** Sign in with a pre-existing account using the password it had before the migration → lands on `/dashboard` → `GET /api/auth/me` returns 200 with the same `id` and `username` as before. *This is the single most important check in the migration.*
2. **Wrong password** → stays on `/login`, shows an error, no session.
3. **New signup.** Register a fresh address → the "Check your email" state renders → confirm the address (Supabase dashboard → Authentication → Users → the new user → confirm, or click the emailed link) → sign in → `/dashboard` loads.
4. **Profile provisioning.** For that new user, assert `public.users` has exactly one row with the new `auth.users` id, that `username` is a sane lowercase slug (**not** an uppercase-stripped mangling like `ayayer`), and that a `portfolio_settings` row exists.
5. **Unconfirmed account is refused.** Register a second address, do not confirm, attempt sign-in → refused with Supabase's "Email not confirmed".
6. **Bad token is refused.** `curl -H "Authorization: Bearer not-a-token" https://<api-domain>/api/auth/me` → 401 `AUTH_REQUIRED`.
7. **Sign out.** Sign out → an authed page redirects to `/login` → the Supabase session key is gone from `localStorage`.
8. **Password reset** (only if Task 11 shipped). `/forgot-password` → email → link → `/reset-password` → set a new password → signed in.

Automated up to the provider handoff, for each of Google, LinkedIn, GitHub:

9. Click the provider button and assert the browser navigates to that provider's real authorization host (`accounts.google.com`, `www.linkedin.com`, `github.com`) with a `redirect_uri` pointing at `https://<project-ref>.supabase.co/auth/v1/callback`.

**Manual (a human must do these — completing a real credential round-trip is not reliably automatable and is against provider automation policy):**

10. For each of Google, LinkedIn, and GitHub: click the button, complete the real consent screen, and confirm you land on `/dashboard` signed in.
11. **Identity re-linking — the check that proves the import worked.** Sign in with Google using the account behind one of the two existing `google_id` rows. It must land on the **existing** profile — same username, same projects — not a fresh empty account. Repeat for one of the two `linkedin_id` rows. A brand-new empty profile here means the `auth.identities` import did not match, and you should roll back rather than proceed to Step 6.

Record the outcome of every numbered check before continuing.

- [ ] **Step 6: Soak, then write the cleanup migration**

Leave the system on the retained legacy columns for at least one full business day of real traffic. **The rollback path is intact until this step runs and stops being intact after it.**

Create `backend/migrations/013_supabase_auth_cleanup.sql`:

```sql
-- Supabase Auth migration (part 3 of 3): drop the legacy auth surface.
--
-- DESTRUCTIVE AND ONE-WAY. Apply only after the Task-13 Step-5 checks have all
-- passed against production traffic, including the manual social re-link check.
-- Until this runs, reverting the code deploy restores the old auth system with no
-- data loss; afterwards, rollback needs a database restore.

DROP TABLE IF EXISTS auth_refresh_tokens;

ALTER TABLE users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS token_version;

-- google_id / github_id / linkedin_id are intentionally KEPT. They are now
-- denormalised copies of auth.identities.provider_id, still read by the profile
-- and integrations surfaces, and they are the audit trail for this import.
```

- [ ] **Step 7: Apply the cleanup and drop the last legacy dependency**

```bash
cd backend
npm run db:migrate
npm uninstall bcryptjs
grep -rn "bcrypt\|password_hash\|token_version\|auth_refresh_tokens" --include=*.js routes middleware config utils jobs scripts server.js worker.js
npm test
```
Expected: the migration applies, the grep returns nothing, and `npm test` PASSes.

- [ ] **Step 8: Final verification and commit**

```bash
cd backend && npm test
cd ../frontend && npx vitest run && npm run build && npx eslint .
```
Expected: all green.

```bash
git add backend/migrations/013_supabase_auth_cleanup.sql backend/package.json backend/package-lock.json
git commit -m "chore(auth): drop legacy password, token-version, and refresh-token storage"
```

---

## Rollback

**Before Task 13 Step 7** (the cleanup migration): revert the code deploy on both backend and frontend. `password_hash`, `token_version`, and `auth_refresh_tokens` are all still present, `JWT_SECRET`/`SESSION_SECRET` are still set, and the provider consoles still list the app's own callback URLs, so the old system comes back intact. The `auth.users` rows and the `users_id_fkey` constraint are harmless to leave in place — nothing in the old code path reads them. Users are signed out once and log back in with the same passwords.

**After Task 13 Step 7:** rollback requires restoring `public.users` from a Supabase backup (Database → Backups) to recover `password_hash` and `token_version`, plus recreating `auth_refresh_tokens` from `001_scalability_schema.sql:76`. Treat this as a real incident, not a redeploy — which is the reason for the soak period in Step 6.

## Risks

| Risk | Why it bites | Mitigation in this plan |
|---|---|---|
| GoTrue NULL-string scan errors | Every imported user's login 500s, with no clue in the app logs | `012` writes `''` into all eight columns; Task 3 asserts it statically; Task 13 Step 3 counts violating rows before the deploy |
| Redirect URL not allowlisted | OAuth fails *after* consent, which reads as "the provider is broken" | Task 12's checklist lists every `redirectTo` the code emits; Step 5 check 9 asserts the URL before any human tries it |
| Confirm-email gate locks out migrated users | 77 of 79 have `is_email_verified = false` | `012` confirms every imported account unconditionally; Task 3 asserts no `is_email_verified` gating; Step 3 requires `unconfirmed = 0` |
| Social login creates duplicate accounts | The `auth.identities` import did not match the provider `sub` | Step 5 check 11 is a manual re-link test, and is a rollback gate |
| Project on legacy HS256 signing | JWKS-only verification rejects every token | Task 12 Step 3 §5 and Task 13 Step 1 both check the JWKS endpoint returns a non-empty `keys` array |
| Agent verification silently degrades | Authenticated route checks run logged-out and report false failures | Task 7 replaces the token injection; the null path is explicit and matches the pre-existing "no JWT_SECRET" behaviour |
| Rate limiter degrades to IP keying | Users behind one NAT throttle each other on `/api/notifications` | Task 6 rewires `keyGenerator` to the verified Supabase `sub` |
| Trigger missing after deploy | Signups land in `auth.users` with no profile; every authed request 401s | `/health/ready` returns 503 when either trigger is absent (Task 6 Step 4) |

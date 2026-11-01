# Security Review — ProjectFolio Backend

**Date:** 2026-07-10
**Scope:** Full backend (`backend/`) — Express API, auth/token subsystem, all 16 route modules, middleware, SSRF/sanitization/custom-site utilities, media upload, OAuth, jobs, and the DB access layer. Live black-box breach testing performed against the running API (`http://localhost:5000`).
**Method:** Static review of every security-relevant code path + live active testing: injection (SQL / NoSQL type-confusion / prototype pollution), authorization/IDOR, input-validation bypass, DoS/body-limit, secret/endpoint exposure, security headers, and rate limiting.

---

## Executive summary

**The backend is exceptionally well-secured — one of the stronger application security postures I have reviewed.** Every high-risk surface (auth, tokens, SSRF, SQL, agent-authored code, file upload) has a correct, defense-in-depth implementation, and the discipline is *consistent* across all 16 route modules rather than patchy.

**No critical, high, or medium-severity exploitable vulnerability was found.** Live breach attempts were all correctly rejected. The findings below are **low-severity hardening items and defense-in-depth suggestions** — none is a confirmed breach in the current configuration.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Low–Med | Puppeteer PDF export renders user data with network enabled (blind SSRF surface) | Confirmed (blind, gated) |
| 2 | Low | Auth rate limit is loose for login brute-force (100/15min shared, per-IP) | Confirmed |
| 3 | Low | CORS allowlist always includes `localhost` origins, even in production | Confirmed |
| 4 | Info | Custom-site executable JS is served on the API origin (contained by CSP) | Confirmed |
| 5 | Info | Oversized request body returns `500` instead of `413` | Confirmed live |
| 6 | Info | Embeddable badge HTML served without its own CSP header | Confirmed |
| 7 | Info | Portfolios with `is_public IS NULL` are treated as public | Confirmed (verify intent) |

---

## What is done well (verified)

**Authentication & tokens** (`middleware/auth.js`, `utils/tokens.js`, `utils/authTokenVersion.js`)
- Stateless JWT access tokens (15m) + a `tokenVersion` checked on **every** request against a server-side store, so tokens are revocable without a blocklist.
- Refresh tokens are **opaque random 48-byte values, SHA-256-hashed before storage** (a DB leak yields no usable tokens), with **rotation + reuse-detection**: replaying a used refresh token revokes the entire token family (`rotateRefreshToken`, `FOR UPDATE` locked). This is best-practice, better than most production apps.
- Refresh cookie is `httpOnly`, `secure` in prod, `SameSite=lax`, path-scoped to `/api/auth`.

**SSRF defense** (`utils/safeFetch.js`) — genuinely sophisticated and correct:
- Blocks non-HTTP(S), credentialed URLs, and non-80/443 ports.
- DNS-resolves and rejects if **any** resolved address is private (covers 10/8, 127, 0.0.0.0, 169.254 link-local, 172.16–31, 192.168, 100.64/10 CGNAT, 198.18/19, multicast, and IPv6 ULA/link-local/NAT64/documentation ranges).
- **Pins the connection to the validated IP via a custom `lookup`**, defeating DNS-rebinding / TOCTOU. Redirects are recursively re-validated. Byte cap + timeout enforced.

**SQL injection** — parameterized queries (`$1..$n`) throughout. The few dynamically-interpolated fragments were audited and are **not** user-controlled: `ORDER BY ${order}` (discover comments) is a hardcoded ternary; `${bucket}`/`${interval}`/`${whereClause}` (analytics) come from a fixed `RANGES` map keyed by `req.query.range` with a safe default; agent snapshot field lists are constant arrays. Live SQLi probes on public inputs returned clean literal handling.

**Input validation** (`middleware/schemaValidation.js`) — strict allowlist schemas. Live-verified to block:
- **Type confusion / NoSQL-style objects** → `{"email":{"$gt":""}}` rejected with `Must be a string.`
- **Prototype pollution** → `__proto__` in the body rejected as `Unexpected body field.`
- **Mass assignment** → unknown fields rejected by default.

**Authorization / IDOR** — consistent `WHERE ... AND (user_id = $current OR accepted-collaborator)` scoping on all mutating resource routes (projects, blocks, media, jobs). `jobs.js` scopes job status/SSE to the owner. No IDOR found. Live unauth access to protected routes → `401`.

**Agent-authored custom sites** (`utils/customSiteSecurity.js`, served in `routes/portfolio.js`) — the one place user-authored JS actually executes, and it is tightly sandboxed:
- Served with a strict **HTTP-header** CSP (not just meta): `default-src 'none'; script-src 'nonce-…'; style-src 'nonce-…'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'` — no network exfiltration possible, nonce-gated scripts, inline handlers blocked.
- Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`.
- Deny-rules additionally strip `<script>/<iframe>/<base>/<form>/on*=/javascript:`, storage/network/`eval`/`postMessage`/parent-window access, and `</script>` breakout is escaped; injected JSON is `<`/`>`/`&`/U+2028/U+2029-escaped.

**Media upload** (`routes/media.js`) — signed direct-to-Cloudinary flow with **constant-time signature comparison** (`crypto.timingSafeEqual`), **server-side re-verification of the uploaded asset** via the Cloudinary API (defeats client-supplied metadata spoofing), `res.cloudinary.com` host allowlist, MIME allowlist, per-user quota + daily cost budget, and ownership checks before attaching media to a project.

**Platform hardening** (`server.js`)
- `helmet` (strict CSP, HSTS, nosniff, XFO, frame-ancestors), `compression`, `cookie-parser`.
- CORS with an origin allowlist (foreign origins → `403`, live-confirmed) + `credentials`.
- Layered rate limiting: global `/api` limiter, `/api/auth` limiter, notification polling limiter (JWT- or IP-keyed), plus per-user quotas / concurrency / cost budgets on expensive routes.
- Sessions: `httpOnly` + `secure` (prod) + `SameSite=lax`, Redis-backed.
- **Production boot guards**: refuses to start without distinct `JWT_SECRET`/`SESSION_SECRET`, without `METRICS_TOKEN`, or without `REDIS_URL`.
- `/metrics` requires a bearer token (returns `404` when unset — live-confirmed); `express.json` limited to 1mb; OAuth uses `state: true` (login-CSRF protection) and redirects only to server-configured `FRONTEND_URL` (no open redirect).

---

## Findings

### 1. Puppeteer PDF export renders user data with the network enabled — Low–Medium

**Where:** `routes/export.js:91-93` — `puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })` then `page.setContent(htmlContent, { waitUntil: 'networkidle0' })`.

The PDF is built from `page.setContent(...)` (not `page.goto` to an attacker URL, so no direct URL-SSRF), but the rendered HTML is assembled from **user-controlled portfolio data** (profile URLs, project block content). Because Chrome loads external subresources during render and waits for `networkidle0`, a user could embed `<img src="http://169.254.169.254/latest/meta-data/…">` (cloud metadata) or internal-host references, causing the render container to issue requests to internal endpoints — a classic **headless-browser SSRF**.

**Why not higher:** it is **blind** — response bodies are not returned to the attacker (a failed image just doesn't render), so it is limited to internal reachability probing / triggering GET side-effects, and only if the render host can reach sensitive internal services. `--no-sandbox` also widens the blast radius if a Chrome RCE were chained.

**Recommendation:** enable Puppeteer **request interception** and allow only `https:` to your asset host(s) (e.g. `res.cloudinary.com`), blocking all private-IP / non-allowlisted requests — reuse the `isPrivateAddress` logic from `safeFetch.js`. Prefer running Chrome **with** the sandbox in a locked-down container (seccomp/user-namespace) rather than `--no-sandbox`, and on an egress-restricted network.

### 2. Loose brute-force limit on authentication — Low

**Where:** `server.js:48` (`authLimiter`, applied at `:164`).

100 attempts / 15 min **per IP**, shared across all `/api/auth` routes (login, register, refresh), with no per-account tracking. Live: 8 rapid failed logins returned `401` with no throttling. Permissive for credential stuffing / password spraying. (Same issue noted in the frontend review.)

**Recommendation:** add a dedicated login limiter keyed on account+IP (~5–10 failures before exponential backoff / temporary lockout), separate from register/refresh; consider CAPTCHA after N failures.

### 3. CORS allowlist always includes `localhost` origins — Low

**Where:** `server.js:81-88` — `allowedOrigins` unconditionally includes `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`, in every environment.

In production the API will accept credentialed cross-origin requests from `localhost` origins. This is **not remotely exploitable** (an attacker cannot make a victim's browser send requests from a `localhost` origin they don't control), so severity is Low, but it is unnecessary attack surface and would matter if a developer ran a malicious local tool.

**Recommendation:** gate the `localhost`/`127.0.0.1` entries to non-production only; in production rely solely on `FRONTEND_URL` + `CORS_ORIGINS`.

### 4. Custom-site executable JS is served on the API origin — Info (defense-in-depth)

**Where:** `routes/portfolio.js` custom-site route (`buildCustomSiteDocument`).

User/agent-authored JavaScript executes in a document served from the **API origin**. It is well-contained today (CSP `connect-src 'none'` blocks exfiltration; API session/refresh cookies are `httpOnly` so JS can't read them; `localStorage` on that origin is empty), so there is no live exploit. But hosting arbitrary executable JS same-origin with authenticated API routes is a latent risk if the CSP is ever weakened.

**Recommendation:** serve published custom sites from a **separate sandbox origin/subdomain** (e.g. `*.sites.projectfolio…`) so a CSP regression cannot reach the API origin. Keep the current header CSP regardless.

### 5. Oversized request body returns `500` instead of `413` — Info

**Where:** `express.json({ limit: '1mb' })` + global error handler (`server.js:182`).

Live: a ~2MB body returned `500`. The 1mb limit **is** enforced (the body is rejected, not processed — DoS protection works), but body-parser's `PayloadTooLargeError` falls through to the generic 500 handler.

**Recommendation:** in the error handler, map `err.type === 'entity.too.large'` to `413` (and JSON parse errors to `400`) for correct semantics and cleaner client handling.

### 6. Embeddable badge HTML has no CSP header — Info

**Where:** `routes/integrations.js:413`.

The public badge endpoint returns `text/html` with all interpolated values escaped (`escapeHtml`, `safeHttpUrl`, `safeCssColor`) — no injection found. Since it is designed to be embedded, adding a restrictive response CSP (`default-src 'none'; style-src 'unsafe-inline'; img-src https:`) would harden it against any future templating regression.

### 7. `is_public IS NULL` treated as public — Info (verify intent)

**Where:** e.g. `routes/integrations.js:397`, portfolio read paths (`ps.is_public = true OR ps.is_public IS NULL`).

Portfolios with no explicit visibility setting are treated as **public** (listed, exported, badge-able). If the intended default is private, this is a data-exposure gap; if public-by-default is intended, no action needed.

**Recommendation:** confirm the intended default and, if private, change the predicate to `ps.is_public = true` (backfill existing NULLs explicitly).

---

## Plan of action (prioritized)

1. **Near-term (Low–Med):**
   - Add Puppeteer request interception (allowlist `https:` asset hosts, block private IPs) and run Chrome sandboxed on an egress-restricted network (finding 1).
   - Add a dedicated per-account+IP login limiter with backoff (finding 2).
2. **Hardening (Low/Info):**
   - Gate `localhost` CORS origins to non-production (finding 3).
   - Plan a separate sandbox origin for published custom sites (finding 4).
   - Confirm the intended default portfolio visibility (finding 7).
3. **Polish (Info):**
   - Map body-parser/JSON errors to `413`/`400` (finding 5).
   - Add a CSP header to the badge endpoint (finding 6).
   - Consider adding CI security regression tests: the prototype-pollution/type-confusion payloads, an SSRF test against `safeFetch`, and a custom-site CSP assertion — to lock in the current strong posture.

---

## Testing notes

- Live target: `http://localhost:5000` (API up during review); no user data was created or modified; no destructive actions taken.
- Live breach probes and results: unauth protected route → `401`; login type-confusion `{$gt:""}` → validation rejected; `__proto__` body → rejected as unexpected field; SQLi on `username`/search → literal-safe `404`/no injection; invalid analytics event → `400`; `/metrics` without token → `404`; oversized body → rejected (`500`, see finding 5).
- Static review confirmed parameterized SQL, DNS-rebind-safe SSRF, hashed/rotated refresh tokens with reuse detection, constant-time media-signature checks, consistent ownership scoping, and a header-based CSP sandbox for agent-authored sites.

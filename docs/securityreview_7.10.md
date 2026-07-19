# Security Review — ProjectFolio Frontend

**Date:** 2026-07-10
**Scope:** Frontend (`frontend/`) with live black-box testing (Playwright against running app on `:3000`/`:5000`) plus supporting backend review of the request/response and sanitization surfaces the frontend depends on.
**Method:** Static review of client code (XSS sinks, token handling, redirects, URL handling, custom CSS/JS/HTML rendering) + live testing: security-header inspection, CORS probing, auth error/brute-force probing, and direct execution of the client HTML sanitizer against a battery of XSS/mXSS bypass payloads in the live browser.

---

## Executive summary

**The application has a strong, layered security posture.** The most important controls are in place and working: server-side allowlist HTML sanitization on every write path, a strict Content-Security-Policy on API responses, an httpOnly refresh-token cookie, an origin-allowlisted CORS policy, parameterized SQL, object-level authorization (owner-or-collaborator) on mutating routes, schema-based input validation, and rate limiting.

No critical or high-severity vulnerability was found. The findings below are **medium/low hardening items** — mostly places where a single failure of another control would remove the last line of defense. They are worth fixing, but none is a confirmed exploitable breach in the current configuration.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Medium | Access JWT stored in `localStorage` (XSS-stealable) | Confirmed |
| 2 | Medium | No guaranteed CSP on the SPA document in production | Confirmed (dev), needs prod verification |
| 3 | Medium→Low | Hand-rolled client HTML sanitizer has confirmed bypasses (defense-in-depth only) | Confirmed via live payload testing |
| 4 | Low | Loose brute-force limit on `/api/auth` (100/15min shared, per-IP) | Confirmed |
| 5 | Low | Block-update endpoint hardcodes `type='text'`, skipping URL sanitization on update | Confirmed (mitigated on read) |
| 6 | Info | App currently in broken dev build (`SiteAgentPage is not defined`) | Confirmed |

---

## What is done well (verified)

- **Server-side allowlist sanitization is the real defense and it runs on every write.** `backend/utils/contentSecurity.js` uses the well-tested `sanitize-html` library with an explicit tag/attribute allowlist. It is called on all block writes (`routes/projects.js` create/sync/update), portfolio writes (`routes/portfolio.js`), settings (`routes/settings.js`), and agent CSS (`routes/agent.js`). Custom CSS is separately stripped of `@import`, `expression()`, `javascript:`/`data:text/html` `url()`, and `</style>` breakouts.
- **Strict CSP on API responses** (helmet): `script-src 'self'; script-src-attr 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'`. `script-src-attr 'none'` blocks inline event handlers, and `base-uri 'self'` neutralizes base-tag injection — both directly blunt the client-sanitizer gaps in finding 3.
- **Refresh token is an httpOnly cookie** — confirmed live: `document.cookie` is empty / not JS-visible. The refresh/rotate flow replays failed requests once (`utils/api.js`).
- **CORS rejects foreign origins** — confirmed live: preflight from `https://evil.example` → `403`.
- **Custom user/agent JavaScript is never executed client-side** — `useCustomJs` in `PublicPortfolioPage.jsx` actively clears JS artifacts rather than running them. Custom CSS is injected via `textContent` (no `</style>` breakout possible) and scoped to `#pf-root`.
- **Parameterized SQL everywhere** reviewed (`$1..$n`) — no string-built queries; no SQL injection surface found.
- **Object-level authorization** on mutating block routes: `WHERE id = $1 AND (user_id = $2 OR collaborator...)` — no IDOR found on the routes reviewed.
- **Input validation** via schema (`s.email`, length caps, `pattern` allowlists) on auth/profile fields.
- **Generic auth errors** — login returns `Invalid email or password.` for both cases (no user enumeration); no stack traces leaked.
- **URL guards** — `normalizePreviewUrl` (file preview) restricts to `http:`/`https:` and blocks same-origin `/api` paths; `safeEmbedUrl` restricts iframes to a host allowlist (YouTube, Vimeo, Figma, etc.).

---

## Findings

### 1. Access JWT stored in `localStorage` — Medium

**Where:** `frontend/src/utils/api.js:24`, `frontend/src/hooks/useAuth.jsx`, `OAuthSuccessPage.jsx`.

The access token is kept in `localStorage` and attached as a `Bearer` header on every request. `localStorage` is readable by any JavaScript running on the origin, so **a single XSS anywhere on the app origin yields full account takeover** — the attacker exfiltrates the token with no httpOnly protection. The refresh token is correctly httpOnly; the access token is not.

Currently mitigated by the strong CSP + server-side sanitization (which is why this is Medium, not High), but it makes every other XSS-adjacent finding more costly.

**Recommendation:** Hold the access token **in memory only** (module variable), relying on the existing httpOnly refresh cookie to re-mint it on load/refresh. If a cookie-based access token is preferred, make it httpOnly + `SameSite=Strict` and pair it with CSRF protection. Also clear the `user` blob from `localStorage`.

### 2. No guaranteed CSP on the SPA document in production — Medium

**Where:** deployment/hosting config (absent from repo); `frontend/index.html` has no `<meta http-equiv="Content-Security-Policy">`.

The strong helmet CSP observed is served on **API responses from `:5000`**. The backend does **not** serve the SPA (no `express.static`/`sendFile`), and the repo contains **no** `vercel.json` / `netlify.toml` / `_headers` / nginx config / meta CSP. Confirmed live: the document served on `:3000` has **no CSP** (expected for Vite dev, but it means production CSP is undefined here).

CSP only protects XSS on the origin that **serves the HTML document that runs the SPA**. If the production static host serves the SPA with no CSP, then the client-side sanitizer (finding 3) becomes the *sole* XSS defense on the app origin, and the `script-src-attr 'none'` / `base-uri 'self'` protections that neutralize finding 3's gaps are gone.

**Recommendation:** Serve the SPA with the same strict CSP at the static-hosting layer (host headers preferred; a `<meta>` CSP in `index.html` as a portable fallback). Verify in production with `curl -D - https://<prod-host>/`.

### 3. Hand-rolled client HTML sanitizer has confirmed bypasses — Medium → Low (defense-in-depth)

**Where:** `sanitizeHtml()` in `frontend/src/pages/PublicProjectPage.jsx:33` (used at line 121 for `text` blocks via `dangerouslySetInnerHTML`).

This is a **denylist** sanitizer (remove a fixed list of tags, strip `on*`/`style`, block `javascript:`/`data:text/html` on `href`/`src`). I ran its exact source against a payload battery in the live browser. Confirmed gaps:

- **`<base href="//evil.com/">` is NOT stripped** — `base` is not in the removed-tags list. Base-tag injection can redirect relative resource/link/form resolution to an attacker origin.
- **`formaction="javascript:..."` is NOT stripped** — only `href`/`src` are checked for dangerous schemes, not `formaction`/`formmethod`.
- **Nested `<template>` content is not sanitized** — `querySelectorAll('*')` does not descend into a nested `<template>`'s inert content, so `on*` attributes survive inside it.
- **`vbscript:` is allowed** (legacy IE only — low).

**Why this is currently Low, not High:** stored HTML is already sanitized server-side by the `sanitize-html` allowlist on every write path, and (in prod, per finding 2) `base-uri 'self'` + `script-src-attr 'none'` would block the base-tag and `formaction` vectors anyway. So today the client sanitizer is redundant defense-in-depth. **But** it is a fragile last line: any write path that skips `sanitizeBlockContent`, any future feature that renders untrusted HTML directly, or any environment without the CSP (finding 2) turns these into live XSS.

**Recommendation:** Replace the hand-rolled sanitizer with **DOMPurify** (allowlist-based, mXSS-hardened, maintained), or render already-server-sanitized content and drop the ad-hoc client pass. Do not extend the denylist — denylists lose this game.

### 4. Loose brute-force limit on authentication — Low

**Where:** `backend/server.js:48` (`authLimiter`), applied at `:164`.

`authLimiter` allows **100 attempts per 15 minutes per IP**, shared across *all* `/api/auth` routes (login, register, refresh). Confirmed live: 8 rapid failed logins all returned `401` with no throttling. 100 attempts/window per IP is permissive for credential stuffing / password spraying and does not track per-account.

**Recommendation:** Add a dedicated, stricter login limiter (e.g. ~5–10 failures per account+IP before exponential backoff / temporary lockout), separate from register/refresh. Consider CAPTCHA after N failures.

### 5. Block-update endpoint hardcodes `type='text'` — Low (mitigated)

**Where:** `backend/routes/projects.js:451` — `sanitizeBlockContent('text', content)`.

The update route forces block type `'text'` into the sanitizer, so on **update** an `embed`/`file` block's `url` skips the type-specific `safeEmbedUrl`/`safeFileUrl` host allowlist (the `html` field is still sanitized). An attacker could store an off-allowlist or `javascript:` URL on an embed/file block via update.

**Mitigation observed:** the public portfolio read path re-sanitizes with the correct `block.type` (`routes/portfolio.js:478`), and `normalizePreviewUrl` guards file URLs client-side — so it does not surface as a live exploit on that path. Still, sanitizing with the wrong type is a latent bug.

**Recommendation:** Pass the real block type: look up the stored block's `type` (or accept it validated) and call `sanitizeBlockContent(actualType, content)`.

### 6. Application is currently in a broken dev build — Info (not a security issue)

Live console shows a runtime `ReferenceError: SiteAgentPage is not defined` (`src/main.jsx`) plus duplicate `createRoot` warnings — consistent with in-progress uncommitted edits. Not a vulnerability, but the app does not fully render in this state; re-test security behavior once the build is green.

---

## Plan of action (prioritized)

1. **Now (Medium):**
   - Move the access token out of `localStorage` → in-memory, backed by the existing httpOnly refresh cookie (finding 1).
   - Ensure the production SPA host serves the strict CSP (headers, with `<meta>` fallback in `index.html`); verify with `curl` against prod (finding 2).
2. **Next (Low, low-effort/high-durability):**
   - Replace the client `sanitizeHtml` with DOMPurify, or drop it in favor of the server-sanitized content (finding 3).
   - Add a dedicated per-account+IP login limiter with backoff (finding 4).
   - Fix `sanitizeBlockContent('text', …)` to use the real block type on update (finding 5).
3. **Hygiene:**
   - Fix the broken `SiteAgentPage` import and re-run this review against a green build (finding 6).
   - Add a regression test that feeds the finding-3 payload battery through whatever sanitizer is chosen, so bypasses are caught in CI.

---

## Testing notes

- Live app: frontend `http://localhost:3000`, backend `http://localhost:5000` (both up during review).
- Sanitizer bypass testing was done by executing the exact `sanitizeHtml` source in the live browser via Playwright against 16 XSS/mXSS payloads; results drove finding 3.
- CORS/headers/brute-force verified with direct HTTP probes; auth returned generic errors and rejected the `evil.example` origin with `403`.
- No user data was created or modified; no destructive actions were taken.

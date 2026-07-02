# ProjectFolio Security Audit

Date: 2026-06-22  
Scope: local frontend, API, background jobs, database-backed authorization paths, OAuth configuration, uploads, outbound fetching, and deployment configuration.

## Executive summary

The application should not be deployed to untrusted users in its current state. The audit confirmed two independent stored-XSS paths that can steal another signed-in user's access token, a cross-tenant authorization flaw, two privacy-control bypasses, and an internal-network request primitive in the PDF renderer. Additional high-risk weaknesses affect OAuth token handling, refresh-token logging, access-token revocation, outbound URL filtering, and resource-abuse resistance.

The highest priority is to isolate or remove user-authored JavaScript, sanitize rich text, repair object-level authorization and visibility checks, prevent the render worker from making arbitrary network requests, and rotate any refresh tokens that may have entered retained logs.

## Method

- Reviewed route middleware, SQL ownership predicates, public/private object loading, token issuance and revocation, OAuth callbacks, logging, uploads, outbound fetching, render workers, job streaming, and rate limiting.
- Exercised the local API using two temporary user accounts and anonymous requests.
- Used a headless browser against the local frontend to verify whether persisted content and custom JavaScript could read another user's token.
- Started a loopback listener to determine whether the PDF renderer would make requests to internal services.
- Tested hostile CORS origins, unauthenticated boundaries, password-change revocation, OAuth redirect parameters, private-object access, and cross-user mutations.
- Ran production dependency audits and a repository secret-pattern scan. Temporary users and their dependent records were deleted after each run.

The reusable evidence harness is `backend/scripts/securityAuditSmoke.js` and can be run with `npm run test:security-smoke` from `backend`.

## Trust boundaries and assets

Primary assets are user accounts and access/refresh tokens, private portfolios and teams, project content, collaborator identity, uploaded files, email-sending reputation, AI/provider budgets, and internal infrastructure reachable by backend workers.

Important trust boundaries are the anonymous browser to API boundary, authenticated users sharing a multi-tenant database, portfolio-owner content rendered in visitor browsers, API-to-provider integrations, API-to-Redis/PostgreSQL, and API-to-headless-Chromium workers. User-authored HTML, JavaScript, embed URLs, upload metadata, and remote URLs must all be treated as hostile.

## Critical findings

### SEC-01: Owner-authored JavaScript executes in every visitor's authenticated origin

`PublicPortfolioPage.jsx` and `PublicProjectPage.jsx` append portfolio-owner JavaScript to the document. The application stores access tokens in `localStorage`, so a malicious portfolio owner can read a signed-in visitor's token and send it elsewhere. The browser test confirmed the visitor token was readable from both public portfolio and project surfaces.

This is an architectural trust-boundary failure, not just an escaping bug. Remove custom JavaScript, or render it on a separate untrusted origin with no application cookies or storage. If scripting remains, use a sandboxed iframe without `allow-same-origin`, a narrow `postMessage` protocol, and a restrictive CSP. Moving the token out of `localStorage` is valuable but does not make same-origin attacker code safe.

Evidence: `frontend/src/pages/PublicPortfolioPage.jsx:867`, `frontend/src/pages/PublicProjectPage.jsx:486`, `frontend/src/utils/api.js`.

### SEC-02: Stored rich-text XSS compromises visitors

Project rich-text blocks are rendered with `dangerouslySetInnerHTML` without sanitization. An owner-controlled event handler executed in a visitor's browser and read that visitor's access token during testing.

Sanitize on write with a strict server-side allowlist and sanitize again at render time as defense in depth. Remove event attributes, scriptable URL schemes, unsafe SVG/MathML, style-based escapes, and arbitrary iframe content. Add a CSP that does not permit inline script or inline event handlers.

Evidence: `frontend/src/pages/PublicProjectPage.jsx:206` and the block create/update routes.

## High findings

### SEC-03: Any authenticated user can remove projects from another team

`DELETE /api/teams/:id/projects/:projectId` checks only that the caller is authenticated. A second user successfully removed a project from a team they did not belong to.

Require an accepted team membership and the intended role, perform the authorization and delete in one ownership-scoped SQL statement or transaction, and return 404 for inaccessible objects. Add attacker/victim integration tests to every team mutation.

Evidence: `backend/routes/teams.js:332`.

### SEC-04: Private portfolio projects and private teams are publicly accessible

An anonymous request received 403 for a private portfolio, while the direct published-project URL returned 200. Separately, an anonymous request to a team marked private returned its data. Public caches can preserve and amplify both disclosures.

Apply the parent visibility rule in every direct child loader and before cache lookup/write. Private teams should require accepted membership; private portfolio projects should be visible only to the owner or explicitly authorized collaborators. Include visibility in cache keys or never publicly cache private-capable records.

Evidence: `backend/routes/portfolio.js:143`, `backend/routes/teams.js:128`.

### SEC-05: PDF rendering can access internal network services

The rendering worker accepts HTML containing attacker-controlled project content, executes it in Chromium, and permits document/image/fetch requests. A test document caused the worker to reach a loopback HTTP server. Chromium also runs with `--no-sandbox`, increasing impact if a browser exploit is reached.

Sanitize and escape generated HTML, disable JavaScript for export pages, and intercept every request with a minimal allowlist or data-only policy. Resolve and reject private, loopback, link-local, multicast, and reserved addresses for each redirect/request. Run Chromium in an isolated container with a read-only filesystem, no cloud metadata route, strict egress policy, resource limits, and its sandbox enabled where supported.

Evidence: `backend/jobs/processors.js:109`, `backend/utils/browserPool.js:6`, `backend/routes/export.js`.

### SEC-06: Outbound URL validation accepts IPv4-mapped IPv6 private addresses

The outbound fetch helper rejects ordinary loopback and link-local addresses but accepted `::ffff:127.0.0.1`, `::ffff:169.254.169.254`, and IPv6 multicast. This bypass affects features using `safeFetchText` and may expose internal services or cloud metadata.

Normalize IPv4-mapped IPv6 before classification, reject all non-global-unicast ranges, validate every DNS answer, retain DNS pinning, and test canonical/encoded IPv4 and IPv6 forms. Prefer a maintained IP classification library plus network-level egress controls.

Evidence: `backend/utils/safeFetch.js:6`.

### SEC-07: Refresh tokens are present in HTTP response logs

Observed request logs included the complete `Set-Cookie` response header from login/registration. The logger redacts request cookies and generic token fields but not response `set-cookie`. Anyone with log access can replay an unexpired refresh token until rotation or revocation.

Redact `res.headers.set-cookie` and serializer variants, avoid logging response headers by default, restrict and shorten log retention, audit access, and rotate tokens that may exist in retained logs.

Evidence: `backend/utils/logger.js:11`.

### SEC-08: OAuth access tokens are placed in redirect URLs

After OAuth, the API redirects with the access token in the query string. Query tokens can enter browser history, reverse-proxy logs, analytics, screenshots, and referrer data.

Return a single-use, short-lived authorization code and exchange it with a same-origin POST, or establish an HttpOnly, Secure, SameSite cookie without placing credentials in the URL. Redact query strings at infrastructure boundaries.

Evidence: `backend/routes/oauth.js:9`.

### SEC-09: Password changes do not revoke existing access tokens

Password change increments `token_version`, but authentication trusts the signed JWT value without comparing it to current server state. The pre-change access token remained accepted after a successful password change.

Check the current token version on authenticated requests using a bounded cache backed by the database, or maintain a revocation epoch/denylist for sensitive events. Continue rotating refresh tokens and keep access-token lifetime short.

Evidence: `backend/routes/auth.js:221`, `backend/middleware/auth.js:12`.

### SEC-10: Expensive and externally visible actions lack per-user abuse controls

AI/agent requests, opportunity matching, PDF generation, outreach email, upload signing, and long-lived job streams rely mainly on a broad IP limiter. An authenticated user can create provider cost, send spam through the platform's SMTP identity, consume storage, or open many SSE connections. Each SSE connection polls PostgreSQL once per second for up to ten minutes.

Add per-user and per-tenant quotas, concurrency limits, cost budgets, recipient/send caps, job deduplication, bounded queues, and provider circuit breakers. Replace per-connection database polling with Redis pub/sub or a shared event fan-out. Enforce storage quotas using provider-confirmed bytes.

Evidence: `backend/routes/jobs.js:22`, agent/export/outreach/media routes.

## Medium findings

### SEC-11: Google OAuth initiation lacks explicit state protection

The Google authorization redirect did not contain a `state` parameter; LinkedIn did. This permits login-CSRF/account-confusion scenarios. Enable Passport state handling with protected session storage or use OAuth Authorization Code with PKCE. Verify issuer, nonce where applicable, and the provider's verified-email claim before linking accounts.

Evidence: `backend/config/passport.js:12`, `backend/routes/oauth.js:26`.

### SEC-12: Upload completion trusts client metadata and arbitrary project IDs

The completion route validates a provider signature over `public_id` and `version`, but trusts client-supplied type, size, URL, dimensions, and `project_id`. It does not prove that the project belongs to the caller or that the object is in the expected account/folder. The signed upload also does not encode the declared size as a provider-enforced limit.

Fetch authoritative provider metadata server-side, require the expected cloud and folder, ownership-scope `project_id`, enforce actual byte/type limits, quarantine active/raw document formats, and add per-user storage quotas and malware scanning.

Evidence: `backend/routes/media.js:14`.

### SEC-13: Metrics are public when `METRICS_TOKEN` is absent

The local `/metrics` endpoint returned approximately 50 KB without authentication because protection is conditional on the environment variable. Production startup does not require the token. Metrics disclose process and application behavior useful for reconnaissance.

Fail production startup without a metrics credential, or bind metrics to a private listener/network protected by infrastructure authentication. Do not expose it through the public API ingress.

Evidence: `backend/server.js:155`.

### SEC-14: Production secret separation is not enforced

`SESSION_SECRET` and `ANALYTICS_VISITOR_SECRET` can fall back to `JWT_SECRET`, and `METRICS_TOKEN` can be absent. Compromise or rotation of one purpose therefore affects multiple controls.

Require independent, high-entropy production secrets for JWT signing, sessions, analytics pseudonyms, metrics, token hashing, and webhook/provider verification. Document rotation and overlap procedures.

### SEC-15: Public embed output interpolates unescaped profile content

The embed HTML response interpolates profile fields and styling values into markup. Helmet currently reduces script execution risk, but markup/style injection can still alter the embed, mislead users, or become executable if CSP changes.

Escape by output context, validate colors and URLs, and build markup through a template engine with automatic escaping.

Evidence: `backend/routes/integrations.js`.

### SEC-16: Any accepted team member can mint reusable invite links

Direct invitations require elevated team privileges, while invite-link generation accepts any team member. If this is not intentional product policy, ordinary members can expand team access outside administrator control.

Require owner/admin role, expire links, support revocation and single-use/usage caps, and record audit events.

Evidence: `backend/routes/teams.js:278`.

### SEC-17: Collaborator and embed surfaces expose more than their parent policy

Authenticated collaborator listing is keyed by project UUID without a project-access predicate. Public project embeds accept arbitrary iframe URLs without a sandbox or provider allowlist. These can disclose relationship data and create phishing/navigation surfaces.

Scope collaborator queries to project owners/accepted collaborators. Allowlist embed providers, normalize URLs, and apply a restrictive iframe `sandbox` and `allow` policy.

Evidence: `backend/routes/collaborators.js`, `frontend/src/pages/PublicProjectPage.jsx`.

### SEC-18: OAuth account linking relies on email without an explicit verified-email check

Provider identities are automatically attached to an existing local account when email strings match. The implementation should explicitly require the provider's verified-email claim and a fresh reauthentication/confirmation step for linking. The LinkedIn existing-account branch also references `linkedinUrl` before its declaration, which can break the flow.

Evidence: `backend/config/passport.js:24`, `backend/config/passport.js:75`.

## Positive controls observed

- Protected routes tested without credentials returned 401, and another user's job ID was not directly exposed.
- Hostile browser origins were rejected by CORS.
- Reviewed SQL uses parameters broadly; dynamic sort selection is allowlisted.
- Refresh tokens are hashed at rest and rotated on use.
- Passwords use bcrypt with cost 12.
- Backend Helmet headers are enabled.
- Outbound fetches pin a resolved DNS address and revalidate redirects, aside from the address-classification bypass above.
- `npm audit --omit=dev` reported zero known production dependency vulnerabilities in both backend and frontend at audit time.
- No likely committed production credentials were found by the bounded secret-pattern scan, and `.env` is ignored.

## Verified abuse-test results

| Test | Result |
| --- | --- |
| Cross-user team-project deletion | Unauthorized mutation returned 200 and removed the record |
| Stored rich-text script behavior | Visitor token readable |
| Owner custom JavaScript | Visitor token readable |
| Private portfolio direct-project access | Parent 403, child 200 |
| Anonymous private-team access | 200 with team data |
| PDF renderer internal request | Loopback listener received request |
| Password-change access-token revocation | Old token still returned 200 |
| Anonymous protected endpoints | 401/404 as expected |

## Remediation order

1. Disable custom JavaScript and unsafe rich-text rendering immediately; invalidate active access sessions after deployment of the fix.
2. Repair team mutation authorization and all parent/child privacy checks; purge affected public caches.
3. Isolate the PDF worker and deny all unapproved egress; fix IPv4-mapped IPv6 and reserved-range handling.
4. Remove OAuth tokens from URLs, add Google state/PKCE, require verified-email account linking, and enforce token-version revocation.
5. Stop response-cookie logging and rotate refresh tokens potentially retained in logs.
6. Add per-user quotas and concurrency controls for AI, email, exports, uploads, analytics, and SSE; move job events off per-client database polling.
7. Harden upload verification, metrics exposure, secret separation, embeds, invite policy, and collaborator authorization.
8. Turn the abuse cases into blocking CI tests. The current smoke script records vulnerable behavior; convert each result into an assertion as the corresponding issue is fixed.

## Residual limits

This was a local source-informed assessment, not an external production penetration test. It did not test cloud IAM, firewall rules, managed database configuration, DNS/TLS, production reverse proxies, provider dashboards, object-storage ACLs, email-domain controls, or secrets already present in third-party systems. Those require a staging environment and explicit infrastructure scope.

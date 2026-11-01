# Deploying the Custom-Site Sandbox

For overall deployment, start with [the deployment entry point](../DEPLOYMENT.md). This guide covers sandbox configuration specifically. Its checklist records required checks, not evidence that a deployment has been completed.

This guide walks you through turning on the **custom-site sandbox** in production, step by step, assuming **no prior experience** with DNS, TLS, reverse proxies, or environment variables. Every term is explained the first time it appears. Follow it top to bottom.

If you only want the short version, jump to the [Quick checklist](#quick-checklist) at the end — but read at least [Part 1](#part-1--what-this-feature-is-and-why-it-needs-a-second-hostname) first so the steps make sense.

---

## Table of contents

1. [What this feature is, and why it needs a second hostname](#part-1--what-this-feature-is-and-why-it-needs-a-second-hostname)
2. [Vocabulary you need (read once)](#part-2--vocabulary-you-need-read-once)
3. [Before you start: what you must already have](#part-3--before-you-start-what-you-must-already-have)
4. [Step 1 — Pick your sandbox hostname](#step-1--pick-your-sandbox-hostname)
5. [Step 2 — Create the DNS record](#step-2--create-the-dns-record)
6. [Step 3 — Get an HTTPS certificate for it](#step-3--get-an-https-certificate-for-it)
7. [Step 4 — Route the hostname to your backend](#step-4--route-the-hostname-to-your-backend)
8. [Step 5 — Set the environment variables](#step-5--set-the-environment-variables)
9. [Step 6 — Rebuild the frontend, then redeploy the backend](#step-6--rebuild-the-frontend-then-redeploy-the-backend)
10. [Step 7 — Verify it works and is actually safe](#step-7--verify-it-works-and-is-actually-safe)
11. [Troubleshooting](#troubleshooting)
12. [How to turn it off (rollback)](#how-to-turn-it-off-rollback)
13. [Quick checklist](#quick-checklist)

---

## Part 1 — What this feature is, and why it needs a second hostname

ProjectFolio lets users (and the AI agent) write their own **HTML, CSS, and JavaScript** for their public portfolio page. That is powerful and also dangerous: JavaScript written by one user runs in the browser of everyone who visits that portfolio. If that code could reach ProjectFolio's login token, a malicious user could steal other people's accounts.

ProjectFolio stores each visitor's **login token** in the browser's `localStorage`. A rule of the web called the **same-origin policy** says: JavaScript can only read the `localStorage` that belongs to its own **origin** (an origin is the combination of `https://` + the hostname, e.g. `https://projectfolio.app`). Code running under a *different* origin literally cannot see it.

So the safety strategy is: **serve the users' custom code from a different hostname than the main app.** Then even if a user writes hostile JavaScript, it runs under the "sandbox" hostname, which has its own empty `localStorage` — there is no token there to steal.

That second hostname is called the **sandbox origin**. This guide is about creating it and wiring it up. The code to enforce all of this is already written and tested; your job is the infrastructure (hostname, certificate, routing) plus two configuration values.

> **Important:** The "sandbox origin" is **not a second server**. It is a second *name* that points at the exact same backend you already run. The backend looks at which name a request came in on and behaves differently. You are not deploying a new app — you are giving your existing app a second front door.

---

## Part 2 — Vocabulary you need (read once)

- **Hostname / host:** the address part of a web URL, e.g. `projectfolio.app`. Also called a domain.
- **Origin:** `scheme + host (+ port)`, e.g. `https://projectfolio.app`. The browser's unit of separation. Two different hostnames are two different origins.
- **DNS (Domain Name System):** the phone book of the internet. A **DNS record** maps a hostname (`usercontent.projectfolio.app`) to a location (an IP address, or another hostname).
- **TLS / SSL certificate:** the file that lets a hostname serve `https://` (encrypted) traffic. Without it, browsers show "Not secure" and this feature won't work. "Getting a certificate" for a host is a standard, usually automatic, step.
- **Reverse proxy / load balancer:** a piece of software (nginx, Caddy, a cloud load balancer, or your hosting platform) that receives web requests and forwards them to your app. It decides *which* app gets a request, often based on the hostname.
- **Environment variable:** a named setting you give a program without changing its code, e.g. `CUSTOM_SITE_SANDBOX_ORIGIN=https://usercontent.projectfolio.app`. The backend and the frontend build read these.
- **Build-time vs runtime:** the **backend** reads its environment variables *while it runs* (runtime). The **frontend** is a bunch of static files created by `npm run build`; its environment variables are frozen into those files *at build time*. Setting a frontend variable after the build has no effect — you must rebuild.
- **App host:** your main hostname, where users log in (e.g. `projectfolio.app`).
- **Sandbox host:** the new hostname you are about to create for custom code (e.g. `usercontent.projectfolio.app`).

---

## Part 3 — Before you start: what you must already have

You should already be running ProjectFolio in production (or a staging environment) with:

- The **backend** API running (from `backend/`, `npm start`), reachable at your app host over HTTPS.
- The **frontend** built (`cd frontend && npm run build`) and served at your app host.
- A **PostgreSQL** database and **Redis** (Redis is required in production).
- Access to wherever your **DNS** is managed (your domain registrar or DNS provider — e.g. Cloudflare, Namecheap, Route 53, Google Domains).
- Access to change **environment variables** and **redeploy** both the backend and frontend on your hosting platform.

If any of those isn't true yet, get the app itself deployed first; this feature is an add-on to a working deployment.

You will make changes in roughly this order: **hostname → certificate → routing → env vars → rebuild/redeploy → verify.** Do them in order; later steps assume earlier ones are done.

---

## Step 1 — Pick your sandbox hostname

You need a hostname that is a **different origin** from your app host. You have two good choices.

### Option A (strongest, recommended): a separate domain

Use a completely separate registered domain. Example:

- App host: `projectfolio.app`
- Sandbox host: `projectfolio-usercontent.app` (a different domain you own)

This is exactly how big companies do it — Google serves user content from `googleusercontent.com`, GitHub from `githubusercontent.com`, precisely so user content can never share anything with the main site.

**Why it's strongest:** two unrelated domains share *nothing* — not cookies, not storage, nothing. There is zero chance of a future mistake leaking data between them.

### Option B (acceptable): a subdomain of your app

Use a subdomain of your existing domain. Example:

- App host: `projectfolio.app`
- Sandbox host: `usercontent.projectfolio.app`

**Why it's acceptable:** a subdomain is still a separate origin, so the login token in `localStorage` is already fully isolated (that's the main threat). The *only* thing subdomains can sometimes share is **cookies** — and only if a cookie is deliberately set to a whole-domain scope (`Domain=.projectfolio.app`). I checked this app's session cookie (`pf_session`): it is created **without** a `Domain`, which makes it "host-only" — it stays on the app host and is never sent to a subdomain. So Option B is safe **today**. The small risk is future: if someone later adds a domain-wide cookie, it could reach the subdomain. Option A removes that possibility entirely.

**Recommendation:** if this is for real users and you can register a second domain, use **Option A**. If you're deploying to staging or want the simplest DNS, **Option B** is fine.

Whatever you choose, write it down. From here on this guide uses `usercontent.projectfolio.app` as the example sandbox host and `projectfolio.app` as the example app host — **substitute your real values everywhere.**

---

## Step 2 — Create the DNS record

Goal: make your sandbox host resolve to the **same place your app already resolves to.**

1. Find out what your app host points to. Look at your existing DNS records for `projectfolio.app`:
   - If it's an **A record**, it points to an **IP address** (e.g. `203.0.113.10`).
   - If it's a **CNAME record**, it points to **another hostname** (e.g. `my-app.onrender.com`) — this is common on hosting platforms like Render, Fly, Railway, Vercel, Netlify, Heroku.
2. In your DNS provider's dashboard, **add a new record for the sandbox host** that points to the **same target**:
   - Subdomain (Option B), platform-hosted: add a **CNAME** for `usercontent` pointing to the same platform hostname your app uses (e.g. `usercontent → my-app.onrender.com`).
   - Subdomain (Option B), your own server: add an **A record** for `usercontent` pointing to the **same IP** as your app.
   - Separate domain (Option A): in that domain's DNS, add an **A record** (to your app's IP) or **CNAME** (to your app's platform hostname), matching whatever your app uses.
3. Save. DNS changes can take a few minutes to an hour to propagate.

Check that the name resolves (run in a terminal — works on Mac/Linux, and on Windows in Git Bash or PowerShell):

```bash
nslookup usercontent.projectfolio.app
```

You should see it resolve to the same IP (or CNAME target) as your app host. If it says "can't find" wait a bit longer and retry.

---

## Step 3 — Get an HTTPS certificate for it

The sandbox host must serve `https://`. How you do this depends on where you host:

- **Hosting platform (Render, Fly, Railway, Vercel, Netlify, Heroku, etc.):** open your backend service's settings and **add the sandbox host as an additional custom domain** on the **same service**. The platform will automatically provision a TLS certificate once DNS is pointing correctly (this is why you did Step 2 first). Wait until the platform shows the domain as "Active" / "Certificate issued."
- **Your own server with nginx/Caddy:**
  - **Caddy:** just add the hostname to your site block; Caddy fetches a Let's Encrypt certificate automatically.
  - **nginx:** run `certbot` (Let's Encrypt) to issue a cert for the sandbox host, e.g. `sudo certbot --nginx -d usercontent.projectfolio.app`.
  - **Wildcard shortcut (Option B only):** if you already have a wildcard certificate for `*.projectfolio.app`, it already covers `usercontent.projectfolio.app` — no new cert needed.
- **Cloud load balancer (AWS ALB, GCP LB, etc.):** add the sandbox host to the certificate (ACM / Google-managed cert) attached to the load balancer, or add a new managed cert for it.

**Confirm HTTPS works** by hitting the app's built-in liveness endpoint on the new host:

```bash
curl -I https://usercontent.projectfolio.app/health/live
```

A `200`-ish response with no certificate error means DNS + TLS + routing all reached your backend. If you get a **certificate error**, the cert isn't ready — wait, or re-check the platform's domain status. If you get a **connection refused / 404 from the wrong place**, routing isn't done yet — that's the next step.

---

## Step 4 — Route the hostname to your backend

The sandbox host must reach the **same backend Express app** as your API. Two things must be true:

### 4a. Requests to the sandbox host reach the backend (not the static frontend)

When a browser is redirected to the sandbox host, it requests this exact path:

```
https://usercontent.projectfolio.app/api/portfolio/<username>/custom-site
```

That `/api/...` path must be handled by your **backend**. On most platforms, if you added the sandbox host to the **backend service** in Step 3, this already works. If you run a reverse proxy that routes by hostname, make sure the sandbox host is routed to the backend service. You do **not** need to serve the React frontend on the sandbox host — the sandbox host only needs to answer `/api/portfolio/:username/custom-site` (and `/health/*`). Anything else returning 404 on that host is fine and even desirable.

### 4b. The backend must see the real hostname (do not rewrite `Host`)

The backend decides "is this the app host or the sandbox host?" by reading the incoming request's **`Host` header**. If your reverse proxy or load balancer **rewrites** the `Host` header to your app host before forwarding, the backend can't tell the two apart and the feature silently fails.

- If you use a plain reverse proxy, ensure it **passes the original host through**. For nginx that's `proxy_set_header Host $host;`. For most platform proxies this is the default.
- If your proxy terminates TLS and sends the real host in `X-Forwarded-Host`, that's fine — this app already runs behind a proxy in production and trusts forwarded headers. Just don't force `Host` to a fixed value.

You'll verify this precisely in Step 7 (the redirect test). For now, just avoid any config that hardcodes the `Host`.

---

## Step 5 — Set the environment variables

There are **two** variables, and they must hold the **same value** — your sandbox origin, written as a full `https://` URL with no path.

### 5a. Backend variable (runtime)

Set this in your backend's environment (the same place you set `DATABASE_URL`, `SUPABASE_URL`, etc. — your platform's "Environment" / "Config Vars" settings, or your `.env` file if you deploy that way):

```bash
CUSTOM_SITE_SANDBOX_ORIGIN=https://usercontent.projectfolio.app
```

### 5b. Frontend variable (build-time — this one is easy to get wrong)

The frontend is compiled by Vite, and it **freezes** this value into the built files at build time. So it must be present **in the environment where you run `npm run build`**, not just on the running server:

```bash
VITE_CUSTOM_SITE_ORIGIN=https://usercontent.projectfolio.app
```

- If you build in CI/CD, add it to the CI environment.
- If your platform builds the frontend for you, add it to that service's build/environment settings.
- If you build locally, `export VITE_CUSTOM_SITE_ORIGIN=...` (Mac/Linux) or set it in PowerShell (`$env:VITE_CUSTOM_SITE_ORIGIN = "..."`) **before** running `npm run build`.

### 5c. Confirm your app origins are set (needed so the frame is allowed)

For security, the sandbox page tells browsers "**only** these origins are allowed to embed me" using a rule called `frame-ancestors`. The backend fills that list from two existing variables. If your **real app origin is not in that list, your own app won't be allowed to show the custom site** and it will appear blank. So confirm these are set to your real production app origin(s):

```bash
FRONTEND_URL=https://projectfolio.app
# If you have more than one app origin (e.g. www), list them comma-separated:
CORS_ORIGINS=https://projectfolio.app,https://www.projectfolio.app
```

> These are already required by the app for other reasons, so they're probably set — but this feature makes them load-bearing for framing, so **double-check them now.** This is the single most common cause of "the sandbox deployed but the custom site shows blank."

**Formatting rules for all of the above:** use `https://` (not `http://`) in production, and no path after the host. A trailing slash is tolerated (the code normalizes `https://host/` to `https://host`).

---

## Step 6 — Rebuild the frontend, then redeploy the backend

Order matters because of the build-time rule in Step 5b.

1. **Rebuild and redeploy the frontend** with `VITE_CUSTOM_SITE_ORIGIN` present:
   ```bash
   cd frontend
   npm run build
   # deploy the produced dist/ (however you normally ship the frontend)
   ```
2. **Redeploy/restart the backend** with `CUSTOM_SITE_SANDBOX_ORIGIN` set (and `FRONTEND_URL` / `CORS_ORIGINS` confirmed).

> If you happen to deploy the backend first, nothing breaks: the old frontend points its iframe at the app host, and the backend now redirects that to the sandbox host, so it still works via a redirect. But rebuild the frontend so it targets the sandbox host **directly** — that's the intended, cleaner path.

Don't forget to also set `CUSTOM_SITE_SANDBOX_ORIGIN` on the **worker** process if it runs from the same config and you keep envs in sync (it doesn't serve custom sites, but keeping envs identical avoids confusion later).

---

## Step 7 — Verify it works and is actually safe

Run these four checks. The first three take seconds; the fourth is the real proof and needs the app fully up.

### 7a. The old hole is closed (app host redirects)

Requesting the executable page on the **app host** must now redirect to the sandbox host:

```bash
curl -sI https://projectfolio.app/api/portfolio/<someuser>/custom-site
```

Look for:
- `HTTP/... 302`
- `location: https://usercontent.projectfolio.app/api/portfolio/<someuser>/custom-site`

If you get `200` instead of `302`, the backend either doesn't have `CUSTOM_SITE_SANDBOX_ORIGIN` set, or your proxy rewrote the `Host` header (Step 4b). If you get `302` but the `location` points back at the app host, re-check the variable's value.

### 7b. The sandbox host serves the page with the right security header

```bash
curl -sI https://usercontent.projectfolio.app/api/portfolio/<someuser>/custom-site
```

Look for:
- `HTTP/... 200`
- `content-type: text/html; charset=utf-8`
- a `content-security-policy:` header whose `frame-ancestors` names your **app** origin (e.g. `frame-ancestors https://projectfolio.app`) — **not** `'self'`.

If `frame-ancestors` says `'self'`, your `CUSTOM_SITE_SANDBOX_ORIGIN` isn't being seen by the backend on that request. If it names the wrong origin, fix `FRONTEND_URL` / `CORS_ORIGINS`.

### 7c. A real custom site renders in a browser

Open, in an actual browser, a public portfolio that has a custom site enabled. Confirm:
- The custom page **renders** inside the frame (no red "refused to frame" or Content-Security-Policy error in the browser's developer console).
- In DevTools (Elements tab), the `<iframe>` for the custom site has `sandbox="allow-scripts"` and **does not** contain `allow-same-origin`. (That combination is what keeps author code powerless against your app; it's set in code and should never be changed.)

If it renders blank with a `frame-ancestors` console error, that's the `FRONTEND_URL`/`CORS_ORIGINS` problem from Step 5c.

### 7d. The containment proof (do this once against staging)

This is the test that actually proves a malicious user cannot steal a login token. From `backend/`, with the app running and `CUSTOM_SITE_SANDBOX_ORIGIN` set in that environment:

```bash
cd backend
npm run test:sandbox-smoke
```

What it does automatically: it plants a **deliberately malicious** custom site (written straight to the database to bypass the normal safety filters), puts a fake victim login token into the app's `localStorage`, loads the portfolio in a real headless browser, and then checks that:
- no network request smuggled the token out to an attacker address,
- the token is **not** visible from inside the sandbox frame (`localStorage.token` is `null` there),
- the served page's security header names the app origin.

**Exit code `0` and "all containment assertions pass" mean the smoke script's assertions passed for that configuration.** Review the evidence alongside the other release checks; a smoke test is not a general security guarantee. A non-zero exit means something in the wiring is wrong — read its printed evidence and revisit the matching step above. Run this against **staging** (a non-production copy) since it writes hostile test data; don't run it against your live production database.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| Custom site shows **blank**, console shows a `frame-ancestors` / "refused to frame" error | Your real app origin isn't in the allowed list | Set `FRONTEND_URL` and `CORS_ORIGINS` to your real app origin(s), redeploy backend (Step 5c) |
| App host returns **200** instead of **302** for `/api/portfolio/.../custom-site` | Backend can't see `CUSTOM_SITE_SANDBOX_ORIGIN`, **or** proxy rewrote `Host` | Confirm the var is set on the backend; ensure the proxy passes the original `Host` (Step 4b) |
| Redirect points back to the **app** host | Wrong value in `CUSTOM_SITE_SANDBOX_ORIGIN` | Fix it to the sandbox origin, redeploy |
| Frontend iframe still requests the **app** host directly | Frontend built without `VITE_CUSTOM_SITE_ORIGIN` | Rebuild the frontend **with** the variable set, redeploy (Steps 5b, 6) |
| `curl` to sandbox host gives a **certificate error** | TLS cert not issued yet | Wait for the platform to issue it, or run certbot; confirm DNS resolved first (Steps 2–3) |
| Sandbox host returns a **404 from the frontend/CDN**, not the API | Hostname routed to the static site, not the backend | Route the sandbox host to the **backend** service (Step 4a) |
| `test:sandbox-smoke` fails | Any of the above, or the app isn't fully running | Read its printed evidence; re-run 7a–7c to localize |
| Everything works but you're unsure it's "really" isolated | — | Run `npm run test:sandbox-smoke` (7d); inspect the assertions and deployed configuration; a `0` exit is evidence for those checks |

---

## How to turn it off (rollback)

If you need to disable the sandbox origin (emergency, or reverting):

1. **Unset** `CUSTOM_SITE_SANDBOX_ORIGIN` on the backend and restart it.
2. **Rebuild** the frontend **without** `VITE_CUSTOM_SITE_ORIGIN` and redeploy.

The app then falls back to its older behavior: it serves custom sites from the app host itself (same origin), with `frame-ancestors 'self'`. It logs a warning and keeps working — it will **not** crash. **But** you lose the isolation protection, so an unset variable in production should be treated as a security incident to fix, not a normal state. Only stay in this mode in local development.

---

## Quick checklist

Substitute your real hostnames for the examples.

- [ ] **Step 1** — Chose a sandbox host that is a different origin (separate domain preferred; subdomain acceptable).
- [ ] **Step 2** — Added a DNS record so the sandbox host resolves to the same target as the app host (`nslookup` confirms).
- [ ] **Step 3** — HTTPS certificate active for the sandbox host (`curl -I https://<sandbox>/health/live` is healthy, no cert error).
- [ ] **Step 4** — Sandbox host routes to the **backend**, and the proxy passes the original `Host` header through.
- [ ] **Step 5** — Set `CUSTOM_SITE_SANDBOX_ORIGIN` (backend) and `VITE_CUSTOM_SITE_ORIGIN` (frontend build) to the same value; confirmed `FRONTEND_URL` / `CORS_ORIGINS` list your real app origin(s).
- [ ] **Step 6** — Rebuilt the frontend **then** redeployed the backend.
- [ ] **Step 7a** — App host returns `302` to the sandbox host.
- [ ] **Step 7b** — Sandbox host returns `200 text/html` with `frame-ancestors` naming the app origin.
- [ ] **Step 7c** — A real custom site renders in a browser; iframe is `sandbox="allow-scripts"` without `allow-same-origin`.
- [ ] **Step 7d** — `npm run test:sandbox-smoke` exits `0` against staging.

When every box is checked, record the environment, tested paths, and results. Isolation is the intended containment boundary; this checklist does not certify that the entire application is secure.

---

### Related documentation

- `CLAUDE.md` → "Custom-site sandbox origin" — the architecture and the code that enforces it.
- `DESIGN.md` → "Custom-code sites are origin-isolated" — where this fits in the product.
- `backend/.env.example` and `frontend/.env.example` — the two environment variables in context with all the others.

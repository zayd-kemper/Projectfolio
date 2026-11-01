# ProjectFolio local setup

This guide describes the current Supabase Auth implementation. It replaces the former setup based on application-issued JWTs. Commands below use PowerShell and assume a fresh development environment, not a migration of an existing live database.

## Prerequisites

- Node.js 22.13 or newer within the 22.x release line, or Node.js 24+, with npm. The locked jsdom dependency sets this minimum for frontend tests.
- Git and a local checkout of this repository.
- A Supabase development project, providing PostgreSQL and Supabase Auth together.
- Optional: Redis for queued jobs and shared cache/rate-limit behavior, Cloudinary for uploads, and an AI-provider key for AI features.

The migrations reference `auth.users` and `auth.identities`. Installing PostgreSQL alone does not create those Supabase Auth schemas. Use a dedicated development project so test accounts and migrations do not affect another application.

## Install dependencies

Open PowerShell at the repository root:

```powershell
node --version
npm --version
npm --prefix backend ci
npm --prefix frontend ci
```

If Puppeteer's browser download fails, resolve that install error before trying browser/PDF checks. A successful dependency installation does not prove that the external services are configured.

## Configure Supabase

1. In your Supabase project, obtain the project URL, publishable/anon key, service-role key, and PostgreSQL connection string. The frontend and backend must use the same project.
2. Use a direct or session-pooler database connection for migrations. The migration runner holds a session advisory lock; transaction pooling is unsuitable for that workflow. Preserve the connection's required SSL options.
3. Configure Auth for email/password signup. Set the development Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback` as a redirect URL.
4. This repository's token verifier accepts ES256 keys from the project's JWKS endpoint. Configure a compatible asymmetric signing key. A legacy HS256-only project will not work with this verifier.
5. Decide whether your development project requires email confirmation. If enabled, complete confirmation before attempting password login. Email delivery limits or SMTP configuration can affect that flow.
6. Google, GitHub, and LinkedIn sign-in are optional. Configure each provider in Supabase and its provider console before testing its button. Use the callback URL supplied by Supabase, not a former Express OAuth route.

Use these official references for current dashboard labels and provider details:

- [Database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)

## Create environment files

From the repository root, copy each example if the destination does not already exist:

```powershell
if (-not (Test-Path -LiteralPath backend/.env)) {
    Copy-Item -LiteralPath backend/.env.example -Destination backend/.env
}
if (-not (Test-Path -LiteralPath frontend/.env)) {
    Copy-Item -LiteralPath frontend/.env.example -Destination frontend/.env
}
notepad backend/.env
notepad frontend/.env
```

Fill in the files before starting the application. Do not replace an existing environment file with these example values.

### Backend

Set these values in `backend/.env` using your development project's actual credentials:

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=<Supabase PostgreSQL connection string>
SUPABASE_URL=<Supabase project URL>
SUPABASE_ANON_KEY=<publishable or anon key>
SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:5000
REDIS_URL=
```

The angle-bracket values above are placeholders to replace. The service-role key belongs only on the backend. The current auth system does not require `JWT_SECRET` or `SESSION_SECRET`.

For the simplest local start, leave `REDIS_URL` empty. The copied example defaults it to localhost; remove that value unless Redis is actually running. Without Redis, shared rate limiting and caching are unavailable and new jobs execute within the API process. This mode is for development, not production.

For Redis-backed testing, set `REDIS_URL` to your running Redis instance and start the worker as described below.

### Frontend

Set these values in `frontend/.env`:

```dotenv
VITE_SUPABASE_URL=<same Supabase project URL>
VITE_SUPABASE_ANON_KEY=<same publishable or anon key>
VITE_API_URL=/api
```

The Vite development server proxies `/api` to `http://localhost:5000`. Change `VITE_API_PROXY_TARGET` only if your development API runs elsewhere. Restart Vite after changing environment values.

## Apply migrations

From the repository root:

```powershell
Set-Location backend
npm run db:migrate
```

The runner applies the SQL files present in `backend/migrations` and records their checksums. Do not edit applied migrations to fix a running database.

Auth migrations create triggers on Supabase-managed Auth tables and require appropriate database permissions. If a migration fails, stop and inspect the error; do not mark it applied manually to bypass a failure. If you are upgrading an existing populated database rather than starting fresh, consult the [historical auth migration runbook](Legacy/AUTH_MIGRATION_RUNBOOK.md) and review its applicability first.

The shipped sequence currently ends at `012_supabase_auth_import.sql`. There is no shipped `013_supabase_auth_cleanup.sql`.

## Start the application

In the backend terminal, after migration succeeds:

```powershell
npm run dev
```

Open a second PowerShell terminal at the repository root:

```powershell
Set-Location frontend
npm run dev
```

Open `http://localhost:3000`. The API defaults to port 5000.

If Redis is enabled, open a third terminal at the repository root:

```powershell
Set-Location backend
npm run worker
```

## Check readiness and create a test account

In another terminal:

```powershell
Invoke-RestMethod http://localhost:5000/health/live
Invoke-RestMethod http://localhost:5000/health/ready
```

Liveness reports whether the API responds. Readiness also checks database schema, required Auth triggers, migration state, and Redis when configured. Resolve a readiness failure before testing features.

Register through the application and complete email confirmation if required. The Supabase signup triggers create the matching application profile. Then add and publish a project and inspect its public page.

Do not use the legacy `db:seed:test-portfolio` script as a signup shortcut: it writes legacy application credentials and does not provision a Supabase Auth identity. Creating a test account through the app is the supported path in this guide.

## Optional features

| Feature | Additional configuration |
| --- | --- |
| Media uploads | Backend `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| AI tools | A configured provider from `backend/.env.example`; Groq is enabled by default, other providers have explicit enable flags |
| Share/outreach email | Backend SMTP settings; Supabase Auth email delivery is configured separately |
| Authenticated agent browser verification | Backend service-role and anon credentials, a real account, and a working browser installation |
| Executable custom sites in production | A dedicated sandbox origin; see [sandbox deployment](CUSTOM_SITE_SANDBOX.md) |

## Verification

From the repository root, in separate invocations:

```powershell
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
```

These are the main automated suites and frontend compilation. They do not replace a manual signup/publish walkthrough. The backend suite uses a fixed file list; adding a test file does not automatically include it in that command.

From `backend`, `npm run test:agent-browser` additionally exercises Chromium-based checks. Those tests can skip when Chromium is unavailable: inspect the counts and reasons rather than treating every zero exit as complete browser coverage.

Live, load, and sandbox smoke scripts require a running configured instance and their own inputs. Inspect each script's prerequisites before using it. Use an isolated test environment for scripts that write data; this guide does not claim their results have been measured or passed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Frontend cannot initialize authentication | Both `VITE_SUPABASE_*` values are set in `frontend/.env`; restart Vite |
| Login works but API returns 401 | Same Supabase project on both sides, compatible ES256 signing key, valid session |
| Signup reports a database error | Migration permissions and the provisioning triggers on `auth.users` |
| Confirmation or OAuth redirects fail | Allowed callback URLs and provider configuration in Supabase |
| Redis connection errors | Redis is running at `REDIS_URL`, or clear the value for local development |
| Database connection fails | Correct database password, host/network reachability, supported connection mode, and required SSL settings |
| API readiness reports warnings | Inspect `schema_migration_warnings`; do not confuse a running process with a healthy schema |
| Uploads or AI features fail | Corresponding optional provider configuration |

For hosting, use the [deployment entry point](../DEPLOYMENT.md). Hosting prices and free-tier availability are not assumed by this guide.

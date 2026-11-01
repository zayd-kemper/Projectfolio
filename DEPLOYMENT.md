# ProjectFolio deployment

This is the entry point for deploying the current Supabase Auth version. The project has been tested locally and is not currently publicly deployed. The instructions are a deployment procedure, not evidence that a production rollout or capacity test has passed.

## Services

- A built React frontend.
- A persistent Node.js API process.
- A separate worker process for BullMQ jobs.
- PostgreSQL and Auth from the same Supabase project.
- Redis, required by the API in production.
- Cloudinary, SMTP, and AI providers for whichever optional features you enable.
- A dedicated custom-site sandbox hostname when exposing executable custom sites.

Use a platform that supports the API/worker runtime and the browser dependencies used by PDF and agent verification. Do not assume that a static host or a free tier supplies those capabilities.

## Configuration

Start with the [local setup](docs/SETUP_GUIDE.md) and the two `.env.example` files. Production requires these backend values at startup:

```dotenv
NODE_ENV=production
DATABASE_URL=<Supabase database connection>
SUPABASE_URL=<Supabase project URL>
SUPABASE_ANON_KEY=<publishable or anon key>
SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
REDIS_URL=<Redis connection>
METRICS_TOKEN=<private random value>
ANALYTICS_VISITOR_SECRET=<separate private random value>
FRONTEND_URL=https://<frontend-host>
APP_URL=https://<api-host>
MIGRATION_WARNINGS_FATAL=true
```

`DATABASE_URL`, media, SMTP, and AI credentials must also work for the features being exercised even when they are not all checked by the startup guard. Add `CORS_ORIGINS` for additional frontend origins if needed.

The API verifies Supabase-issued access tokens. Do not introduce legacy `JWT_SECRET` or `SESSION_SECRET` values as new deployment requirements. Redis backs distributed limits, quotas, cache, and jobs; it does not store application login sessions.

Set the frontend's build-time environment:

```dotenv
VITE_SUPABASE_URL=<same Supabase project URL>
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
VITE_API_URL=https://<api-host>/api
```

If your production reverse proxy serves `/api` from the frontend origin, use `VITE_API_URL=/api` instead. Vite's development proxy does not configure a production static host. Rebuild after changing a `VITE_*` value.

Configure the real frontend Site URL and `/auth/callback` redirect in Supabase. Configure optional OAuth providers there and in their provider consoles. See the [official redirect guide](https://supabase.com/docs/guides/auth/redirect-urls).

## Release sequence

1. Install backend and frontend dependencies from the lockfiles using `npm ci` in each directory.
2. Apply shipped migrations once as a release step using `npm run db:migrate` from `backend`, over a direct or session-capable connection with appropriate permissions. Review an existing populated database's migration path before upgrading it.
3. Resolve migration ownership warnings before enabling public traffic. `npm run db:retry-warnings` uses `MIGRATION_DATABASE_URL` when owner credentials are required.
4. Start the API with `npm start` from `backend`.
5. Start the worker with `npm run worker` from `backend`, using the same application database and Redis. The worker sets its process role internally.
6. Build the frontend with `npm run build` from `frontend` and publish the resulting `frontend/dist` directory. Configure SPA route fallback to `index.html` so direct links work.
7. Configure load-balancer readiness using `/health/ready`, not just `/health/live`. Require a healthy schema and both Auth triggers; confirm the migration warning table is clear.
8. Verify signup, email confirmation if enabled, login, logout, project editing, publishing, and public/private access behavior in staging. Exercise optional features separately with their provider configuration.

The current migration sequence ends at `012_supabase_auth_import.sql`. A cleanup migration numbered 013 is not included. Do not run an invented filename or remove dependencies based on an old plan.

## Custom sites

Before enabling executable custom sites for untrusted users, follow [the custom-site sandbox guide](docs/CUSTOM_SITE_SANDBOX.md). Set both `CUSTOM_SITE_SANDBOX_ORIGIN` and `VITE_CUSTOM_SITE_ORIGIN`, configure DNS/TLS/routing, and verify the deployed containment behavior in staging. An unset origin falls back to development behavior; it is not an acceptable production rollout for that feature.

## Cache and scaling

Redis invalidation does not purge a separate CDN. The public response headers use `s-maxage=60` and `stale-while-revalidate=300`; an edge may serve stale content for roughly six minutes. Account for that behavior before caching public pages at a CDN.

See [operating notes](docs/SCALABILITY_DEPLOYMENT.md). User-count estimates in historical design documents are not measured capacity. Establish capacity using the load scripts against a staging environment and record the configuration and results.

## Historical authentication migration

The [legacy Auth migration runbook](docs/Legacy/AUTH_MIGRATION_RUNBOOK.md) records a specific earlier cutover and rollback procedure. It is not the fresh-install guide. Verify every step against the target database before reusing it.

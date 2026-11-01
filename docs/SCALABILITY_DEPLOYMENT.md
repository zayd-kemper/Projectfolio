# Scaling and operating notes

Use the [deployment guide](../DEPLOYMENT.md) for release configuration and order. These notes describe controls available in the source; they do not establish a measured user capacity.

## Process and database controls

- The API and BullMQ worker share the same PostgreSQL database and Redis instance. Start the worker with `npm run worker` from `backend`.
- Redis coordinates job claiming, distributed rate limits, quotas, and caches. Supabase owns authentication sessions.
- Set `DB_POOL_MAX_WEB` and `DB_POOL_MAX_WORKER` with the total number of processes in mind. Defaults are 8 and 4 per process; adding replicas multiplies the possible connections.
- Keep API and worker statement timeouts appropriate for their workloads. Inspect slow-query logs and queue duration before increasing concurrency.
- Run migrations once per release over a session-capable connection, before switching traffic. Keep `MIGRATION_WARNINGS_FATAL=true` after resolving any ownership warnings.

## Health and monitoring

- `/health/live` is a liveness check.
- `/health/ready` checks database/schema, Auth triggers, migration warnings, and configured Redis connectivity.
- `/metrics` is protected by `METRICS_TOKEN` in the current server implementation.
- Keep `ANALYTICS_VISITOR_SECRET` stable across replicas and separate from `METRICS_TOKEN`. No application JWT signing or session secret is required by the current Auth implementation.

Monitor database pool usage, query latency, API errors, Redis failures, job queue latency, and worker failures. The repository includes bounded maintenance for event and job retention; verify the chosen retention values fit the features you use.

## Verification

Run the main suites and frontend build as described in [setup verification](SETUP_GUIDE.md#verification). From `backend`, the available live-service tools include:

```powershell
npm run verify:scalability
npm run test:load
```

Inspect the scripts' inputs before running them against an isolated staging instance. Record workload, concurrency, dataset size, process counts, service limits, and latency/error measurements. A script passing at one workload is not proof of a general capacity claim.

## Cache behavior

Public page caches use a configurable Redis TTL and owner-scoped invalidation helpers. Authenticated responses are private. A CDN is a separate cache: origin invalidation does not clear its copies. Consult the [deployment guide](../DEPLOYMENT.md#cache-and-scaling) before enabling edge caching.

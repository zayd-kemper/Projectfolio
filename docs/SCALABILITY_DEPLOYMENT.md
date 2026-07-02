# Scalability deployment

## Release order

1. Provision PostgreSQL and Redis in the same region as the application.
2. Run `npm run db:migrate` from `backend` once as the release command.
3. Start the API with `npm start` from `backend`.
4. Start a separate worker service with `npm run worker` from `backend`.
5. Build the frontend with `npm run build` from `frontend`.

The API deliberately refuses to start in production without `REDIS_URL`. Redis backs shared sessions, distributed rate limits, cache entries, and BullMQ jobs.

## Database ownership warnings

`db:migrate` records non-transactional index statements that PostgreSQL rejects because the runtime role does not own a legacy table. Resolve them once with a database-owner URL:

```powershell
$env:MIGRATION_DATABASE_URL = '<owner PostgreSQL URL>'
npm run db:retry-warnings
```

Set `MIGRATION_WARNINGS_FATAL=true` in production after the warnings are resolved. `/health/ready` then prevents an instance with incomplete indexes from receiving traffic.

## Capacity controls

- Keep `DB_POOL_MAX_WEB * api replicas + DB_POOL_MAX_WORKER * worker replicas` below the PostgreSQL connection limit, with room for migrations and administration.
- Start with `DB_POOL_MAX_WEB=8`, `DB_POOL_MAX_WORKER=4`, and `WORKER_CONCURRENCY=4`; tune from queue latency and database saturation metrics.
- Use `METRICS_TOKEN` to protect `/metrics`, and alert on readiness failures, HTTP p95 latency, database query duration, pool waiters, failed jobs, and queue depth.
- Keep `ANALYTICS_VISITOR_SECRET`, `JWT_SECRET`, and `SESSION_SECRET` independent and stable across replicas.
- Run at least two API replicas behind a load balancer. Workers can scale separately because job claiming is coordinated by Redis.

## Verification

Run these checks against the release artifact:

```powershell
npm test
npm run verify:scalability
npm run db:migrate
```

From `frontend`, run `npm run build`. Use `backend/scripts/loadSmoke.js` against staging and raise concurrency gradually while watching PostgreSQL, Redis, queue, and application metrics.

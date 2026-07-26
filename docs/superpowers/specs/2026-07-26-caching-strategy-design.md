# Caching Strategy: Pre-Production Hardening

**Date:** 2026-07-26
**Status:** Approved, ready for implementation planning
**Scope:** Approach A (pre-launch hygiene). Approach B is specified but deferred.

## Background

The question that started this was "do we need Redis, and at what user count?" The
answer is that Redis is already a hard production dependency: `backend/server.js:211`
refuses to boot in production without `REDIS_URL`. There is no adoption decision left
to make. The real question is where the current caching strategy breaks first, and
that is what this document addresses.

## Current architecture

`backend/utils/cache.js` is 42 lines wrapping Redis GET/SET with a 60-second default
TTL (`PUBLIC_CACHE_TTL_SECONDS`). Redis backs six subsystems:

| Subsystem | Mechanism | Behaviour without Redis |
| --- | --- | --- |
| Public page cache | `public:portfolio:*`, `public:project:*`, `public:team:*` | None — every request hits Postgres |
| Auth profile | `auth:profile:{id}`, 60s, on every authenticated request | None — one extra query per request |
| Rate limiting | `rate-limit-redis` store | In-memory, per-process; incorrect across instances |
| AI/user quotas | `INCR` + `expire` | In-memory `Map`; same per-process flaw |
| Analytics dedupe | `SET NX EX 31min` | None |
| Job queue | BullMQ | Hard requirement |

Three read paths use the cache — public portfolio, public project, public team — and
all three are gated on `if (!req.user)`. Each miss costs three database queries.

### What holds up

The portfolio path, which is the traffic we expect to dominate. Keys are per-username
with a 60-second TTL, so a heavily-viewed portfolio costs at most three queries per
minute regardless of view volume. The responses already carry
`Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`. Those
directives do nothing today but become significant the moment a CDN sits in front.

### What does not hold up

**Discover has no caching.** The `recommended` and `for_you` score expressions
(`backend/routes/discover.js:516-556`) compute roughly eight correlated subqueries per
candidate row: `EXISTS` checks against `user_follows`, `post_likes`, `post_saves`,
`post_comments` and `post_media`, plus a 14-day `COUNT(*)` over `discover_events`.
Every scroll and every pagination request recomputes the whole thing. Cost scales with
the candidate set, so this degrades as content grows even at flat user numbers.

**Invalidation is global.** `backend/routes/projects.js:421` calls
`invalidatePattern('public:*')`. One user editing one project triggers a `SCAN` across
the keyspace and evicts every user's cached portfolio, project and team pages.

**No stampede protection.** `getOrSet` takes no lock, so N concurrent misses on a hot
key produce N simultaneous database renders. The portfolio routes do not even use
`getOrSet` — they call `getJson`/`setJson` directly.

**`discover_events` grows without bound.** It is written on every card impression, is
not partitioned (only `analytics_events` is, per `backend/worker.js:36`), and
`runMaintenance` has no retention step for it.

### Verified against production, 2026-07-26

A concern that migration `006`'s `CREATE INDEX CONCURRENTLY` might have degraded to a
`schema_migration_warnings` entry under a non-owner role turned out to be unfounded:

- `idx_discover_events_user_type_created` exists — 006 applied cleanly
- `schema_migration_warnings` is empty
- `discover_events` holds 151 rows

The index is the covering index that keeps the 14-day impression subquery cheap. The
class of risk remains for future concurrent-index migrations, so it becomes a
pre-deploy check rather than a fix.

## Scaling thresholds

These are estimates, not measurements. They should be validated with the existing
`npm run verify:scalability` and `npm run test:load` scripts before being relied on.
Peak concurrency drives them (roughly 2–5% of registered users for a social product),
and `DB_POOL_MAX_WEB` (default 8) is the per-instance ceiling — not Redis.

| Registered users | Binding constraint | Required work |
| --- | --- | --- |
| < ~1,000 | None | Current setup suffices. Redis matters for multi-instance rate-limit correctness, not load. |
| ~1,000–5,000 | Discover feed latency | CDN in front; cache viewer-independent feed modes |
| ~5,000–20,000 | Personalised scoring, `discover_events` size | Bound/cache per-user scoring; retention; consider a read replica |
| > ~20,000 | Postgres CPU | Precomputed/materialised feed |

## Scope: Approach A

### 1. `discover_events` retention — `backend/worker.js`

Add a batched delete to the hourly `runMaintenance` cycle. Introduce
`DISCOVER_EVENT_RETENTION_DAYS`, default 30, with a **hard floor of 15 enforced in
code**. The scoring query looks back 14 days; a retention value below that would
silently corrupt recommendations rather than fail loudly, so the floor is a
correctness guard, not a convenience.

Delete in batches (`LIMIT 5000`) so the statement cannot hold a long lock once the
table is large.

### 2. Owner-scoped cache invalidation

Keys are `public:portfolio:{username}`, `public:project:{username}:{slug}` and
`public:team:{slug}`. Replace the global patterns:

- `invalidate('public:portfolio:{username}')` — exact key, no `SCAN`
- `invalidatePattern('public:project:{username}:*')` — bounded scan
- `invalidate('public:team:{slug}')` — exact key

Call sites: `backend/routes/projects.js:301,421`, `backend/routes/settings.js:213-214,276`,
`backend/routes/teams.js:276,382,407`, `backend/routes/agent.js:75-76`.

Each site must be checked for `username`/`slug` being in scope. Where it genuinely is
not, keep the existing global pattern rather than inventing a lookup — correctness
first, and note it for follow-up.

This is the highest-value change in A: it stops one user's edit from evicting
everyone's cache.

### 3. CDN-safety headers — `backend/routes/portfolio.js`, `backend/routes/teams.js`

`Cache-Control` is currently set only inside the `!req.user` branch
(`portfolio.js:132,280,419,497`). The authenticated branch sets no cache header and
there is no `Vary` header anywhere, so the same URL returns two different bodies with
nothing telling a cache to distinguish them.

- Add `Vary: Authorization` to both branches
- Add `Cache-Control: private, no-store` to the authenticated branch

Cloudflare bypasses cache for requests carrying `Authorization`, so this is latent
rather than live. It is a default worth not depending on. **This must land before a
CDN is introduced, not after.**

### 4. Deploy runbook — `DEPLOYMENT.md`

Document the pre-cutover check: `/health/ready` must not report `ready_with_warnings`,
and `schema_migration_warnings` must be empty. This is the check that would have caught
the migration-006 scenario had it occurred.

### 5. Documentation fix — `CLAUDE.md`

The architecture section claims Redis backs sessions via `connect-redis`. It does not.
Neither `express-session` nor `connect-redis` appears in `backend/package.json`, and
`backend/test/supabaseAuthWiring.test.js:47-48` actively asserts their absence.
Sessions were removed during the Supabase migration; auth is stateless JWT.

## Testing

Backend tests use `node --test`. Per the project's `tdd-guard` setup, results must be
recorded through the custom reporter, so tests are written before implementation.

- **Retention:** the 15-day floor is enforced when `DISCOVER_EVENT_RETENTION_DAYS` is
  set below it; deletion is batched; rows inside the window survive.
- **Invalidation:** editing one user's project evicts only that user's keys; another
  user's cached portfolio survives. This is the regression that matters most.
- **Headers:** the authenticated branch emits `private, no-store`; both branches emit
  `Vary: Authorization`.

## Deferred: Approach B

Not in scope. Recorded here and as a pointer comment at the `discover.js` scoring site.
Deliberately **not** recorded in `graphify-out/`, since `graphify update .` regenerates
that directory and would erase the note.

B would add:

- Shared-key caching for viewer-independent feed modes (`latest`, `trending` — their
  score expressions do not reference `$1`), 30–60s TTL
- Per-user caching of the scored candidate ID list (~60–120s) so pagination stops
  re-running the scoring query
- Stampede protection in `getOrSet`

Deferred because its design depends on real traffic data — which feed modes are
actually used, and what the real hit rates look like. Building it against assumed
numbers risks optimising the wrong path. Revisit when approaching the ~1,000–5,000
user band, or sooner if Discover p95 latency degrades.

## Out of scope

- CDN selection and configuration (deployment decision, still open)
- Approach C (materialised feed, read replica) — premature
- Any change to `DB_POOL_MAX_WEB` — revisit with load-test data

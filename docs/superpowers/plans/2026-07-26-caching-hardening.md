# Caching Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three caching gaps that block production launch — unbounded `discover_events` growth, globally-scoped cache invalidation, and CDN-unsafe response headers.

**Architecture:** Two new small utility modules (`discoverEventRetention.js`, `publicCacheHeaders.js`) plus four new helpers in the existing `utils/cache.js`. Route files change only at their call sites. No new dependencies, no schema changes, no migration.

**Tech Stack:** Node.js, Express, ioredis, node-postgres, `node --test` (node:test + node:assert/strict).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-caching-strategy-design.md`
- Backend commands run from `backend/`. There is no root package manifest.
- Single test file: `node --test test/<name>.test.js`
- `npm test` runs an **explicit file list** in `backend/package.json`. Every new test file MUST be appended to that list or it will never run in CI.
- Tests stub dependencies with `Module._load` — follow `backend/test/authProfile.test.js`.
- Cache key formats are fixed: `public:portfolio:{username}`, `public:project:{username}:{slug}`, `public:team:{slug}`.
- The recommendation scoring in `routes/discover.js:550` looks back **14 days**. Retention below that silently degrades recommendations. The floor is 15 days.
- Never use `res.setHeader('Vary', ...)`. `compression()` already sets `Vary: Accept-Encoding`; `setHeader` overwrites it. Use Express's `res.vary()`, which appends.
- All invalidation calls keep their existing `.catch(() => {})` — cache failures must never fail a write.

---

### Task 1: `discover_events` retention

`discover_events` is written on every card impression, is not partitioned, and has no
cleanup. Verified 2026-07-26: 151 rows today, growing without bound.

**Files:**
- Create: `backend/utils/discoverEventRetention.js`
- Create: `backend/test/discoverEventRetention.test.js`
- Modify: `backend/worker.js` (imports; `runMaintenance`)
- Modify: `backend/package.json` (test file list)
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `query` from `../config/database`
- Produces: `pruneDiscoverEvents(): Promise<number>` (rows deleted), `resolveRetentionDays(raw?: string|number): number`, and constants `MINIMUM_RETENTION_DAYS` (15), `DEFAULT_RETENTION_DAYS` (30), `BATCH_SIZE` (5000), `MAX_BATCHES` (20)

- [ ] **Step 1: Write the failing test**

Create `backend/test/discoverEventRetention.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let queries = [];
let rowCounts = [];

Module._load = function (request, parent, isMain) {
  if (request === '../config/database') {
    return {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rowCount: rowCounts.length ? rowCounts.shift() : 0, rows: [] };
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  pruneDiscoverEvents,
  resolveRetentionDays,
  MINIMUM_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  BATCH_SIZE,
  MAX_BATCHES,
} = require('../utils/discoverEventRetention');
Module._load = originalLoad;

test.beforeEach(() => {
  queries = [];
  rowCounts = [];
});

test('retention defaults to 30 days when unset', () => {
  assert.equal(resolveRetentionDays(undefined), DEFAULT_RETENTION_DAYS);
  assert.equal(resolveRetentionDays(''), DEFAULT_RETENTION_DAYS);
});

test('retention never drops below the 14-day scoring lookback', () => {
  assert.equal(resolveRetentionDays('5'), MINIMUM_RETENTION_DAYS);
  assert.equal(resolveRetentionDays('1'), MINIMUM_RETENTION_DAYS);
  assert.equal(resolveRetentionDays('-3'), DEFAULT_RETENTION_DAYS);
});

test('retention honours a larger configured value', () => {
  assert.equal(resolveRetentionDays('90'), 90);
});

test('pruning stops once a batch comes back short', async () => {
  rowCounts = [BATCH_SIZE, 12];
  const deleted = await pruneDiscoverEvents();
  assert.equal(deleted, BATCH_SIZE + 12);
  assert.equal(queries.length, 2);
});

test('pruning is capped so one cycle cannot run unbounded', async () => {
  rowCounts = new Array(MAX_BATCHES + 5).fill(BATCH_SIZE);
  await pruneDiscoverEvents();
  assert.equal(queries.length, MAX_BATCHES);
});

test('pruning passes the resolved retention window to the query', async () => {
  rowCounts = [0];
  await pruneDiscoverEvents();
  assert.equal(queries[0].params[0], DEFAULT_RETENTION_DAYS);
  assert.equal(queries[0].params[1], BATCH_SIZE);
  assert.match(queries[0].sql, /DELETE FROM discover_events/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && node --test test/discoverEventRetention.test.js
```

Expected: FAIL — `Cannot find module '../utils/discoverEventRetention'`

- [ ] **Step 3: Write the implementation**

Create `backend/utils/discoverEventRetention.js`:

```js
// Discover impression events accumulate on every card view and were previously
// never removed — the table is not partitioned the way analytics_events is.
//
// The recommendation scoring in routes/discover.js looks back 14 days. Retention
// shorter than that would quietly degrade recommendations instead of failing, so
// the floor below is a correctness guard rather than a convenience default.

const { query } = require('../config/database');

const MINIMUM_RETENTION_DAYS = 15;
const DEFAULT_RETENTION_DAYS = 30;
const BATCH_SIZE = 5000;
const MAX_BATCHES = 20;

const resolveRetentionDays = (raw = process.env.DISCOVER_EVENT_RETENTION_DAYS) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.max(MINIMUM_RETENTION_DAYS, Math.floor(parsed));
};

// Deleted in bounded batches so the statement cannot hold a long lock once the
// table is large, and capped so one maintenance cycle cannot run away.
const pruneDiscoverEvents = async () => {
  const days = resolveRetentionDays();
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const result = await query(
      `DELETE FROM discover_events
       WHERE id IN (
         SELECT id FROM discover_events
         WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
         ORDER BY created_at
         LIMIT $2
       )`,
      [days, BATCH_SIZE]
    );
    const removed = result.rowCount || 0;
    deleted += removed;
    if (removed < BATCH_SIZE) break;
  }
  return deleted;
};

module.exports = {
  pruneDiscoverEvents,
  resolveRetentionDays,
  MINIMUM_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  BATCH_SIZE,
  MAX_BATCHES,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && node --test test/discoverEventRetention.test.js
```

Expected: PASS — 6 tests

- [ ] **Step 5: Wire into the worker's maintenance cycle**

In `backend/worker.js`, add the import alongside the other `utils` requires near the top:

```js
const { pruneDiscoverEvents } = require('./utils/discoverEventRetention');
```

In `runMaintenance`, add `pruneDiscoverEvents()` to the existing `Promise.all` array so it becomes:

```js
    await Promise.all([
      query('DELETE FROM background_jobs WHERE expires_at < NOW()'),
      query("UPDATE post_stats SET trending_score = (like_count * 3 + comment_count * 2) * GREATEST(0.1, 1 - EXTRACT(EPOCH FROM (NOW() - updated_at)) / 604800), updated_at = NOW()"),
      query("UPDATE user_stats SET recent_views = 0, trending_score = follower_count * 5 + project_count * 2, updated_at = NOW() WHERE updated_at < NOW() - INTERVAL '7 days'"),
      ensureFutureAnalyticsPartition(),
      pruneDiscoverEvents(),
    ]);
```

- [ ] **Step 6: Register the test file and document the env var**

In `backend/package.json`, append ` test/discoverEventRetention.test.js` to the end of the `"test"` script's file list (before the closing quote).

In `backend/.env.example`, add below the `PUBLIC_CACHE_TTL_SECONDS=60` line:

```
# Days of discover_events history to keep. Floored at 15 in code: the Discover
# recommendation scoring looks back 14 days.
DISCOVER_EVENT_RETENTION_DAYS=30
```

- [ ] **Step 7: Verify the whole suite still passes**

```bash
cd backend && npm test
```

Expected: PASS, including the new `discoverEventRetention` tests.

- [ ] **Step 8: Commit**

```bash
git add backend/utils/discoverEventRetention.js backend/test/discoverEventRetention.test.js backend/worker.js backend/package.json backend/.env.example
git commit -m "feat(worker): prune discover_events on a retention window"
```

---

### Task 2: Scoped cache-invalidation helpers

`invalidatePattern('public:*')` currently evicts every user's cache. These helpers
give callers an owner-scoped alternative while preserving a global fallback for the
sites that genuinely cannot name an owner.

**Files:**
- Modify: `backend/utils/cache.js`
- Create: `backend/test/cacheInvalidation.test.js`
- Modify: `backend/package.json` (test file list)

**Interfaces:**
- Consumes: existing `invalidate`, `invalidatePattern` in the same module
- Produces: `invalidatePortfolio(username?: string): Promise<void>`, `invalidateProjects(username?: string): Promise<void>`, `invalidatePublicUser(username?: string): Promise<void>`, `invalidateTeam(slug?: string): Promise<void>`. Every one accepts a falsy argument and degrades to the old global pattern.

- [ ] **Step 1: Write the failing test**

Create `backend/test/cacheInvalidation.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let deleted = [];
let scanned = [];

const fakeRedis = {
  del: async (...keys) => { deleted.push(...keys); return keys.length; },
  unlink: async (...keys) => { deleted.push(...keys); return keys.length; },
  scan: async (cursor, _match, pattern) => {
    scanned.push(pattern);
    return ['0', [pattern.replace('*', 'matched')]];
  },
};

Module._load = function (request, parent, isMain) {
  if (request === '../config/redis') return { getRedis: () => fakeRedis };
  return originalLoad(request, parent, isMain);
};

const {
  invalidatePortfolio,
  invalidateProjects,
  invalidatePublicUser,
  invalidateTeam,
} = require('../utils/cache');
Module._load = originalLoad;

test.beforeEach(() => {
  deleted = [];
  scanned = [];
});

test('invalidatePortfolio deletes an exact key without scanning', async () => {
  await invalidatePortfolio('ada');
  assert.deepEqual(deleted, ['public:portfolio:ada']);
  assert.deepEqual(scanned, []);
});

test('invalidateProjects scopes the scan to one owner', async () => {
  await invalidateProjects('ada');
  assert.deepEqual(scanned, ['public:project:ada:*']);
});

test('invalidateTeam deletes an exact key without scanning', async () => {
  await invalidateTeam('rocketry');
  assert.deepEqual(deleted, ['public:team:rocketry']);
  assert.deepEqual(scanned, []);
});

test('an unknown owner still falls back to the global pattern', async () => {
  await invalidatePortfolio(null);
  await invalidateProjects(undefined);
  await invalidateTeam('');
  assert.deepEqual(scanned, ['public:portfolio:*', 'public:project:*', 'public:team:*']);
});

test('one owner\'s invalidation never touches another owner\'s keys', async () => {
  await invalidatePublicUser('ada');
  assert.ok(!deleted.some((key) => key.includes('grace')));
  assert.ok(scanned.every((pattern) => pattern.includes('ada')));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && node --test test/cacheInvalidation.test.js
```

Expected: FAIL — `invalidatePortfolio is not a function`

- [ ] **Step 3: Write the implementation**

In `backend/utils/cache.js`, insert after the existing `invalidatePattern` definition
and before `module.exports`:

```js
// Owner-scoped invalidation. A pattern like 'public:*' evicts every user's cached
// pages because one person edited one project, so callers that know whose content
// changed should say so. A falsy argument keeps the old global behaviour for the
// few call sites that genuinely cannot name an owner.

const invalidatePortfolio = async (username) => {
  if (!username) return invalidatePattern('public:portfolio:*');
  return invalidate(`public:portfolio:${username}`);
};

const invalidateProjects = async (username) => {
  if (!username) return invalidatePattern('public:project:*');
  return invalidatePattern(`public:project:${username}:*`);
};

const invalidatePublicUser = async (username) => {
  await Promise.all([invalidatePortfolio(username), invalidateProjects(username)]);
};

const invalidateTeam = async (slug) => {
  if (!slug) return invalidatePattern('public:team:*');
  return invalidate(`public:team:${slug}`);
};
```

Replace the existing `module.exports` line with:

```js
module.exports = {
  getJson,
  setJson,
  getOrSet,
  invalidate,
  invalidatePattern,
  invalidatePortfolio,
  invalidateProjects,
  invalidatePublicUser,
  invalidateTeam,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && node --test test/cacheInvalidation.test.js
```

Expected: PASS — 5 tests

- [ ] **Step 5: Register the test file**

In `backend/package.json`, append ` test/cacheInvalidation.test.js` to the `"test"` script's file list.

- [ ] **Step 6: Commit**

```bash
git add backend/utils/cache.js backend/test/cacheInvalidation.test.js backend/package.json
git commit -m "feat(cache): add owner-scoped invalidation helpers"
```

---

### Task 3: Owner-scoped invalidation in `projects.js`

Contains the subtle correctness point in this plan. The block-sync route allows
**accepted collaborators** to edit a project they do not own
(`routes/projects.js:382-388`), so `req.user.username` there is the *editor*, not the
*owner*. Scoping to the editor would leave the owner's portfolio cache stale. The
owner's username must come from the existing access query.

**Files:**
- Modify: `backend/routes/projects.js` (import; lines ~301, ~382-388, ~421)

**Interfaces:**
- Consumes: `invalidatePortfolio`, `invalidatePublicUser` from Task 2

- [ ] **Step 1: Update the import**

Replace the existing line 7:

```js
const { invalidatePattern } = require('../utils/cache');
```

with:

```js
const { invalidatePortfolio, invalidatePublicUser } = require('../utils/cache');
```

- [ ] **Step 2: Scope the reorder route**

This route's `UPDATE ... WHERE p.user_id = $2` is already restricted to the caller,
so the editor is the owner and `req.user.username` is correct.

Replace (around line 301):

```js
    await invalidatePattern('public:portfolio:*').catch(() => {});
```

with:

```js
    await invalidatePortfolio(req.user.username).catch(() => {});
```

- [ ] **Step 3: Make the block-sync access query return the owner's username**

Replace the access query (around lines 382-388):

```js
    const access = await client.query(
      `SELECT p.id, p.user_id, p.content_version FROM projects p
       WHERE p.id = $1 AND (p.user_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id AND pc.user_id = $2 AND pc.status = 'accepted'
       )) FOR UPDATE`,
      [req.params.projectId, req.user.id]
    );
```

with:

```js
    const access = await client.query(
      `SELECT p.id, p.user_id, p.content_version, owner.username AS owner_username
       FROM projects p
       JOIN users owner ON owner.id = p.user_id
       WHERE p.id = $1 AND (p.user_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc
         WHERE pc.project_id = p.id AND pc.user_id = $2 AND pc.status = 'accepted'
       )) FOR UPDATE OF p`,
      [req.params.projectId, req.user.id]
    );
```

Note `FOR UPDATE OF p` — a bare `FOR UPDATE` would now also try to lock the joined
`users` row, which is both unnecessary and a deadlock risk.

- [ ] **Step 4: Scope the block-sync invalidation to the owner**

Replace (around line 421):

```js
    await invalidatePattern('public:*').catch(() => {});
```

with:

```js
    // The editor may be a collaborator, so invalidate the owner's cache, not theirs.
    await invalidatePublicUser(access.rows[0].owner_username).catch(() => {});
```

- [ ] **Step 5: Verify no stale global patterns remain in this file**

```bash
cd backend && grep -n "invalidatePattern" routes/projects.js
```

Expected: no output.

- [ ] **Step 6: Run the suite**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/routes/projects.js
git commit -m "fix(cache): scope project invalidation to the owning user"
```

---

### Task 4: Owner-scoped invalidation in `settings.js` and `agent.js`

Both files only ever mutate the caller's own portfolio — `settings.js` keys every
write on `req.user.id`, and every `ai_change_sets` query in `agent.js` is scoped
`WHERE id = $1 AND user_id = $2`. So `req.user.username` is the owner at all seven
call sites.

**Files:**
- Modify: `backend/routes/settings.js` (import; lines ~213-214, ~276)
- Modify: `backend/routes/agent.js` (import; helper at ~73; call sites at 2154, 2184, 2331, 2387, 2440)

**Interfaces:**
- Consumes: `invalidatePortfolio`, `invalidatePublicUser` from Task 2

- [ ] **Step 1: Update the `settings.js` import**

Replace line 7:

```js
const { invalidatePattern } = require('../utils/cache');
```

with:

```js
const { invalidatePortfolio, invalidatePublicUser } = require('../utils/cache');
```

- [ ] **Step 2: Scope both `settings.js` call sites**

Replace (around lines 212-215):

```js
    await Promise.all([
      invalidatePattern('public:portfolio:*').catch(() => {}),
      invalidatePattern('public:project:*').catch(() => {}),
    ]);
```

with:

```js
    await invalidatePublicUser(req.user.username).catch(() => {});
```

Replace (around line 276):

```js
      await invalidatePattern('public:portfolio:*').catch(() => {});
```

with:

```js
      await invalidatePortfolio(req.user.username).catch(() => {});
```

- [ ] **Step 3: Update the `agent.js` import**

Replace line 38:

```js
const { invalidatePattern } = require('../utils/cache');
```

with:

```js
const { invalidatePublicUser } = require('../utils/cache');
```

- [ ] **Step 4: Give the agent helper an owner parameter**

Replace the helper (around line 73):

```js
const invalidatePublicPortfolioCache = async () => {
  await Promise.all([
    invalidatePattern('public:portfolio:*').catch(() => {}),
    invalidatePattern('public:project:*').catch(() => {}),
  ]);
};
```

with:

```js
// Agent routes only ever mutate the caller's own portfolio — every ai_change_sets
// query is scoped `WHERE id = $1 AND user_id = $2` — so the caller's username is
// always the owner here.
const invalidatePublicPortfolioCache = async (username) => {
  await invalidatePublicUser(username).catch(() => {});
};
```

- [ ] **Step 5: Pass the username at all five call sites**

At lines 2154, 2184, 2331, 2387 and 2440, replace each occurrence of:

```js
await invalidatePublicPortfolioCache();
```

with:

```js
await invalidatePublicPortfolioCache(req.user.username);
```

- [ ] **Step 6: Verify every call site was updated**

```bash
cd backend && grep -n "invalidatePublicPortfolioCache()" routes/agent.js; grep -n "invalidatePattern" routes/settings.js routes/agent.js
```

Expected: no output from either command.

- [ ] **Step 7: Run the suite**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/routes/settings.js backend/routes/agent.js
git commit -m "fix(cache): scope settings and agent invalidation to the owning user"
```

---

### Task 5: Slug-scoped invalidation in `teams.js`

The team cache key is `public:team:{slug}` but these routes carry `req.params.id`.
The update route can return the slug from its existing `RETURNING *`; the two
project routes need a lookup. `teams.slug` is a `character varying` column (verified
against production 2026-07-26). The update statement does not modify `slug`, so
there is no old-key-versus-new-key problem.

**Files:**
- Modify: `backend/routes/teams.js` (import; lines ~276, ~382, ~399-407)

**Interfaces:**
- Consumes: `invalidateTeam` from Task 2

- [ ] **Step 1: Update the import**

Replace line 7:

```js
const { getJson, setJson, invalidatePattern } = require('../utils/cache');
```

with:

```js
const { getJson, setJson, invalidateTeam } = require('../utils/cache');
```

- [ ] **Step 2: Scope the team-update route**

The `UPDATE ... RETURNING *` already puts the slug in `result.rows[0]`.

Replace (around line 276):

```js
    await invalidatePattern('public:team:*').catch(() => {});
```

with:

```js
    await invalidateTeam(result.rows[0].slug).catch(() => {});
```

- [ ] **Step 3: Scope the add-project route**

Replace (around line 382):

```js
    await invalidatePattern('public:team:*').catch(() => {});
```

with:

```js
    const addedTeam = await query('SELECT slug FROM teams WHERE id = $1', [req.params.id]);
    await invalidateTeam(addedTeam.rows[0]?.slug).catch(() => {});
```

- [ ] **Step 4: Scope the remove-project route**

This route already selects from `teams`, so the slug comes along for free.

Replace its membership query (around line 399):

```js
    const memberCheck = await query(
      `SELECT tm.role, t.owner_id
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.team_id = $1 AND tm.user_id = $2 AND tm.status = 'accepted'`,
      [req.params.id, req.user.id]
    );
```

with:

```js
    const memberCheck = await query(
      `SELECT tm.role, t.owner_id, t.slug
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.team_id = $1 AND tm.user_id = $2 AND tm.status = 'accepted'`,
      [req.params.id, req.user.id]
    );
```

Then replace (around line 407):

```js
    await invalidatePattern('public:team:*').catch(() => {});
```

with:

```js
    await invalidateTeam(memberCheck.rows[0].slug).catch(() => {});
```

- [ ] **Step 5: Verify no global team patterns remain**

```bash
cd backend && grep -n "invalidatePattern" routes/teams.js
```

Expected: no output.

- [ ] **Step 6: Run the suite**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/routes/teams.js
git commit -m "fix(cache): scope team invalidation to the affected team slug"
```

---

### Task 6: CDN-safety response headers

`Cache-Control` is currently set only inside the `!req.user` branch, and no `Vary`
header exists anywhere. The same URL returns two different bodies with nothing telling
a shared cache to distinguish them. Cloudflare bypasses cache on `Authorization` by
default, so this is latent rather than live — but it must land before a CDN is
introduced, not after.

**Files:**
- Create: `backend/utils/publicCacheHeaders.js`
- Create: `backend/test/publicCacheHeaders.test.js`
- Modify: `backend/routes/portfolio.js` (lines ~132, ~279-281, ~419, ~496-498)
- Modify: `backend/routes/teams.js` (lines ~183, ~229)
- Modify: `backend/package.json` (test file list)

**Interfaces:**
- Produces: `setPublicCacheHeaders(res): void`, `setPrivateCacheHeaders(res): void`, and constants `PUBLIC_CACHE_CONTROL`, `PRIVATE_CACHE_CONTROL`

- [ ] **Step 1: Write the failing test**

Create `backend/test/publicCacheHeaders.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setPublicCacheHeaders,
  setPrivateCacheHeaders,
  PUBLIC_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
} = require('../utils/publicCacheHeaders');

// Minimal stand-in for an Express response. `vary` appends, matching Express.
const makeRes = (initialVary) => {
  const headers = {};
  if (initialVary) headers.Vary = initialVary;
  return {
    headers,
    setHeader(key, value) { headers[key] = value; },
    getHeader(key) { return headers[key]; },
    vary(field) {
      headers.Vary = headers.Vary ? `${headers.Vary}, ${field}` : field;
      return this;
    },
  };
};

test('public responses stay edge-cacheable for 60s', () => {
  const res = makeRes();
  setPublicCacheHeaders(res);
  assert.equal(res.getHeader('Cache-Control'), PUBLIC_CACHE_CONTROL);
  assert.match(res.getHeader('Cache-Control'), /s-maxage=60/);
});

test('authenticated responses are never stored by a shared cache', () => {
  const res = makeRes();
  setPrivateCacheHeaders(res);
  assert.equal(res.getHeader('Cache-Control'), PRIVATE_CACHE_CONTROL);
  assert.match(res.getHeader('Cache-Control'), /no-store/);
});

test('both variants vary on Authorization', () => {
  const publicRes = makeRes();
  setPublicCacheHeaders(publicRes);
  assert.match(publicRes.getHeader('Vary'), /Authorization/);

  const privateRes = makeRes();
  setPrivateCacheHeaders(privateRes);
  assert.match(privateRes.getHeader('Vary'), /Authorization/);
});

test('Vary is appended, not clobbered', () => {
  // compression() sets Vary: Accept-Encoding upstream. Overwriting it would break
  // encoding negotiation for every cached response.
  const res = makeRes('Accept-Encoding');
  setPublicCacheHeaders(res);
  assert.match(res.getHeader('Vary'), /Accept-Encoding/);
  assert.match(res.getHeader('Vary'), /Authorization/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && node --test test/publicCacheHeaders.test.js
```

Expected: FAIL — `Cannot find module '../utils/publicCacheHeaders'`

- [ ] **Step 3: Write the implementation**

Create `backend/utils/publicCacheHeaders.js`:

```js
// Public read routes return a different body to authenticated callers at the same
// URL. Without a Vary header nothing tells a shared cache those are distinct
// responses. Cloudflare happens to bypass cache when Authorization is present, but
// that is a vendor default worth not depending on.
//
// Always use res.vary() rather than res.setHeader('Vary', ...): compression()
// already sets Vary: Accept-Encoding, and setHeader would overwrite it.

const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

const setPublicCacheHeaders = (res) => {
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.vary('Authorization');
};

const setPrivateCacheHeaders = (res) => {
  res.setHeader('Cache-Control', PRIVATE_CACHE_CONTROL);
  res.vary('Authorization');
};

module.exports = {
  setPublicCacheHeaders,
  setPrivateCacheHeaders,
  PUBLIC_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && node --test test/publicCacheHeaders.test.js
```

Expected: PASS — 4 tests

- [ ] **Step 5: Apply to `portfolio.js`**

Add the import next to the existing cache import near line 7:

```js
const { setPublicCacheHeaders, setPrivateCacheHeaders } = require('../utils/publicCacheHeaders');
```

In the cache-hit branch of the portfolio route (around line 132), replace:

```js
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
```

with:

```js
        setPublicCacheHeaders(res);
```

In the response tail of the portfolio route (around lines 278-281), replace:

```js
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    }
    res.json(response);
```

with:

```js
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      setPublicCacheHeaders(res);
    } else {
      setPrivateCacheHeaders(res);
    }
    res.json(response);
```

Now the public project route. In its cache-hit branch (around line 419), replace:

```js
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
```

with:

```js
        setPublicCacheHeaders(res);
```

And in its response tail (around lines 495-498), replace:

```js
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    }
    res.json(response);
```

with:

```js
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      setPublicCacheHeaders(res);
    } else {
      setPrivateCacheHeaders(res);
    }
    res.json(response);
```

- [ ] **Step 6: Apply to `teams.js`**

Add the import next to the existing cache import near line 7:

```js
const { setPublicCacheHeaders, setPrivateCacheHeaders } = require('../utils/publicCacheHeaders');
```

In the public team route's cache-hit branch (around line 183), replace:

```js
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
```

with:

```js
        setPublicCacheHeaders(res);
```

In its response tail (lines 228-232), replace:

```js
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    }
    res.json(response);
```

with:

```js
    if (!req.user) {
      await setJson(cacheKey, response).catch(() => {});
      setPublicCacheHeaders(res);
    } else {
      setPrivateCacheHeaders(res);
    }
    res.json(response);
```

- [ ] **Step 7: Verify no raw cache headers remain**

```bash
cd backend && grep -n "s-maxage" routes/portfolio.js routes/teams.js
```

Expected: no output. (`utils/customSiteSecurity.js` has its own separate cache handling
and is intentionally untouched.)

- [ ] **Step 8: Register the test and run the suite**

Append ` test/publicCacheHeaders.test.js` to the `"test"` script's file list in `backend/package.json`, then:

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/utils/publicCacheHeaders.js backend/test/publicCacheHeaders.test.js backend/routes/portfolio.js backend/routes/teams.js backend/package.json
git commit -m "fix(http): vary public responses on Authorization for CDN safety"
```

---

### Task 7: Documentation and deferred-work pointer

**Files:**
- Modify: `DEPLOYMENT.md`
- Modify: `CLAUDE.md`
- Modify: `backend/routes/discover.js` (comment above the scoring expression, ~line 516)

- [ ] **Step 1: Add the pre-cutover check to `DEPLOYMENT.md`**

Add a section near the other pre-launch checks:

```markdown
### Pre-cutover: confirm migrations applied cleanly

Some migrations use `CREATE INDEX CONCURRENTLY`, which can fail with a Postgres
ownership error (`42501`) under a non-owner role. That failure is recorded in
`schema_migration_warnings` rather than failing the deploy, so it is silent.

`idx_discover_events_user_type_created` (migration 006) is the covering index that
keeps the Discover recommendation query cheap. If it is missing, Discover degrades
badly under load.

Before sending production traffic, confirm both:

1. `GET /health/ready` reports `ready`, not `ready_with_warnings`
2. `SELECT COUNT(*) FROM schema_migration_warnings;` returns 0

If either check fails, run `npm run db:retry-warnings` with an owner-level
`MIGRATION_DATABASE_URL` and re-check.
```

- [ ] **Step 2: Correct the stale sessions claim in `CLAUDE.md`**

In the "Two independently deployed processes + a worker" section, replace:

```
Redis backs sessions (`connect-redis`), rate limiting (`rate-limit-redis`), and the job queue.
```

with:

```
Redis backs rate limiting (`rate-limit-redis`), user quotas, the public-page cache, the auth-profile cache, analytics dedupe, and the job queue. It does **not** back sessions — auth is stateless Supabase JWT, and `test/supabaseAuthWiring.test.js` asserts `express-session`/`connect-redis` stay absent.
```

- [ ] **Step 3: Add the deferred-work pointer in `discover.js`**

Immediately above `const recommendationScoreSql = ...` (around line 516):

```js
// PERF (deferred): this expression runs ~8 correlated subqueries per candidate row
// and is recomputed on every scroll and pagination request. It is the first thing
// expected to break under load — see the thresholds and the caching design in
// docs/superpowers/specs/2026-07-26-caching-strategy-design.md ("Deferred: Approach B").
// Revisit when approaching ~1,000-5,000 registered users, or sooner if Discover p95
// latency degrades.
```

- [ ] **Step 4: Verify the full suite one last time**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add DEPLOYMENT.md CLAUDE.md backend/routes/discover.js
git commit -m "docs: record migration pre-cutover check and deferred Discover caching"
```

---

## Verification

After all seven tasks:

```bash
cd backend && npm test
cd backend && grep -rn "invalidatePattern('public:" routes/    # expect: no output
cd backend && npx eslint . 2>/dev/null || true
```

Manual check, requires a running instance with Redis:

1. Load `/api/portfolio/<user-a>` twice logged out — second response carries `X-Cache: HIT`
2. Confirm the response carries `Vary: Accept-Encoding, Authorization`
3. Edit user B's project, then re-request user A's portfolio — it must still be `X-Cache: HIT`. Before this work it would have been a MISS. This is the core regression.
4. Request the same URL with a valid `Authorization` header — expect `Cache-Control: private, no-store`

## Out of scope

Approach B (Discover feed caching, stampede protection in `getOrSet`), CDN selection
and configuration, and any change to `DB_POOL_MAX_WEB`. See the spec for rationale.

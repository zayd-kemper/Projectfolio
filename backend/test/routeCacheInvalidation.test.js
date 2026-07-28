const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Route-level coverage for cache invalidation.
//
// The repo has no HTTP harness (no supertest), so these tests load a route module
// with its middleware stubbed to pass-through, pull the final handler off the
// Express router stack, and invoke it with a fake req/res. That is enough to prove
// a route actually calls the invalidation it is supposed to — the class of bug
// that is otherwise invisible until a stale page shows up in production.

const originalLoad = Module._load;

let invalidationCalls = [];
let dbRows = [];
let dbReadRows = [];

// `s` builds schemas at module load; every member just needs to be callable.
const schemaBuilder = new Proxy(function () { return {}; }, {
  get: () => schemaBuilder,
  apply: () => ({}),
});

const stubs = {
  '../config/database': () => ({
    // Read-side guards (uniqueness checks, existence probes) must not accidentally
    // receive the mutation's return row, or handlers short-circuit before the
    // invalidation under test. Only the mutating statement gets `dbRows`.
    query: async (sql) => {
      const mutating = /^\s*(UPDATE|INSERT|DELETE|WITH)/i.test(sql);
      // dbReadRows may be a function when a handler issues several different reads
      // and each needs its own row set.
      const reads = typeof dbReadRows === 'function' ? dbReadRows(sql) : (dbReadRows || []);
      const rows = mutating ? dbRows : reads;
      return { rows, rowCount: rows.length };
    },
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
  }),
  '../middleware/auth': () => ({
    requireAuth: (req, res, next) => next(),
    optionalAuth: (req, res, next) => next(),
  }),
  '../middleware/userQuotas': () => ({ userQuota: () => (req, res, next) => next() }),
  '../middleware/schemaValidation': () => ({
    validateSchema: () => (req, res, next) => next(),
    s: schemaBuilder,
  }),
  '../utils/authProfile': () => ({
    invalidateAuthProfile: async () => {},
    loadAuthProfile: async () => null,
  }),
  '../utils/portfolioCacheInvalidation': () => new Proxy({}, {
    get: (_t, name) => async (...args) => { invalidationCalls.push({ name, args }); },
  }),
  '../utils/cache': () => new Proxy({}, {
    get: (_t, name) => async (...args) => { invalidationCalls.push({ name, args }); },
  }),
};

const loadRoute = (routePath) => {
  Module._load = function (request, parent, isMain) {
    if (stubs[request]) return stubs[request]();
    return originalLoad(request, parent, isMain);
  };
  delete require.cache[require.resolve(routePath)];
  const router = originalLoad(routePath, module, false);
  Module._load = originalLoad;
  return router;
};

// Express keeps each route's middleware chain in `route.stack`; the real handler is
// the last entry, after the stubbed-out auth/quota/validation layers.
const handlerFor = (router, method, path) => {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `no ${method.toUpperCase()} ${path} route found`);
  const chain = layer.route.stack;
  return chain[chain.length - 1].handle;
};

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.setHeader = () => {};
  res.vary = () => res;
  return res;
};

const named = (name) => invalidationCalls.filter((c) => c.name === name);

test.beforeEach(() => {
  invalidationCalls = [];
  dbRows = [];
  dbReadRows = [];
});

// Accepting a team invite adds a member, and the member list is part of the cached
// team body.
test('accepting a team invite invalidates that team page', async () => {
  const router = loadRoute('../routes/collaborators');
  dbReadRows = (sql) => {
    if (/FROM teams/i.test(sql)) return [{ name: 'Rocketry', owner_id: 'u-1', slug: 'rocketry' }];
    if (/team_members/i.test(sql)) return [];
    return [{ id: 'inv-1', type: 'team', target_id: 'team-1', invited_by: 'u-1', status: 'pending' }];
  };
  dbRows = [{ id: 'inv-1' }];

  await handlerFor(router, 'post', '/join/:token')(
    { user: { id: 'u-2', username: 'grace', full_name: 'Grace' }, params: { token: 't' }, body: {} },
    fakeRes(), () => {}
  );

  assert.equal(named('invalidateTeam').length, 1, 'joining a team must invalidate the team page');
  assert.deepEqual(named('invalidateTeam')[0].args, ['rocketry']);
});

// The cached team body includes its member list, but these routes are addressed by
// team id while the cache is keyed by slug.
test('team membership, role and delete routes invalidate the affected team page', async () => {
  const router = loadRoute('../routes/teams');
  const admin = { id: 'u-1', username: 'ada' };

  for (const [method, path] of [
    ['delete', '/:id/members/:userId'],
    ['put', '/:id/members/:userId/role'],
  ]) {
    invalidationCalls = [];
    dbReadRows = [{ role: 'admin', owner_id: 'u-1', slug: 'rocketry' }];
    dbRows = [{ id: 'team-1' }];
    await handlerFor(router, method, path)(
      { user: admin, params: { id: 'team-1', userId: 'u-2' }, body: { role: 'member' } }, fakeRes(), () => {}
    );
    assert.equal(
      named('invalidateTeam').length, 1,
      `${method.toUpperCase()} ${path} must invalidate the team page`
    );
    assert.deepEqual(named('invalidateTeam')[0].args, ['rocketry'],
      'the slug must come from the team row the route already fetches');
  }

  // Deleting the team must clear its cached page too — and the slug has to be
  // captured from the delete itself, since the row is gone afterwards.
  invalidationCalls = [];
  dbReadRows = [{ owner_id: 'u-1', slug: 'rocketry' }];
  dbRows = [{ slug: 'rocketry' }];
  await handlerFor(router, 'delete', '/:id')(
    { user: admin, params: { id: 'team-1' }, body: {} }, fakeRes(), () => {}
  );
  assert.equal(named('invalidateTeam').length, 1, 'DELETE /:id must invalidate the deleted team page');
  assert.deepEqual(named('invalidateTeam')[0].args, ['rocketry']);
});

// Collaborators appear in both cached bodies (routes/portfolio.js:193 and
// routes/teams.js:211). On these routes req.user is the COLLABORATOR, never
// reliably the owner — a collaborator can even remove themselves — so the owner has
// to be resolved from the project row rather than taken from the caller.
test('collaborator join and removal invalidate by resolved owner, not by the caller', async () => {
  const router = loadRoute('../routes/collaborators');
  const joiner = { id: 'u-2', username: 'grace', full_name: 'Grace' };

  // Accepting a project invite changes the owner's cached collaborator list.
  invalidationCalls = [];
  dbReadRows = [{ id: 'inv-1', type: 'project', target_id: 'project-1', invited_by: 'u-1', status: 'pending' }];
  dbRows = [{ id: 'inv-1', user_id: 'u-1', title: 'Rocket' }];
  await handlerFor(router, 'post', '/join/:token')(
    { user: joiner, params: { token: 't' }, body: {} }, fakeRes(), () => {}
  );
  assert.equal(
    named('invalidateForProjectId').length, 1,
    'joining a project must invalidate the project owner caches'
  );
  assert.deepEqual(named('invalidateForProjectId')[0].args, ['project-1']);

  // Removing a collaborator does too.
  invalidationCalls = [];
  dbReadRows = [{ user_id: 'u-1' }];
  dbRows = [];
  await handlerFor(router, 'delete', '/project/:projectId/collaborator/:userId')(
    { user: joiner, params: { projectId: 'project-1', userId: 'u-2' }, body: {} }, fakeRes(), () => {}
  );
  assert.equal(
    named('invalidateForProjectId').length, 1,
    'removing a collaborator must invalidate the project owner caches'
  );
});

// Approved endorsements are rendered into the cached portfolio body
// (routes/portfolio.js selects them WHERE is_approved = true), so every route that
// changes approval state has to clear it. The unauthenticated submit route does
// not: a submitted endorsement is not approved, so nothing cached changes yet.
test('endorsement approve, reject and delete each invalidate the owner portfolio cache', async () => {
  const router = loadRoute('../routes/endorsements');
  const owner = { id: 'u-1', username: 'ada' };

  for (const [method, path] of [['patch', '/:id/approve'], ['patch', '/:id/reject'], ['delete', '/:id']]) {
    invalidationCalls = [];
    dbRows = [{ id: 'e-1' }];
    const handler = handlerFor(router, method, path);
    await handler({ user: owner, params: { id: 'e-1' }, body: {} }, fakeRes(), () => {});
    assert.equal(
      named('invalidatePortfolio').length, 1,
      `${method.toUpperCase()} ${path} must invalidate the owner's portfolio cache`
    );
    assert.deepEqual(named('invalidatePortfolio')[0].args, ['ada']);
  }
});

test('PUT /auth/profile invalidates the public portfolio cache for the edited user', async () => {
  dbRows = [{ id: 'u-1', username: 'ada-lovelace', full_name: 'Ada' }];
  const router = loadRoute('../routes/auth');
  const handler = handlerFor(router, 'put', '/profile');

  const req = {
    user: { id: 'u-1', username: 'ada' },
    body: { full_name: 'Ada', username: 'ada-lovelace' },
  };
  await handler(req, fakeRes(), () => {});

  const calls = named('invalidateForProfileUpdate');
  assert.equal(calls.length, 1, 'profile update must invalidate the public portfolio cache');
  assert.deepEqual(calls[0].args, ['ada', 'ada-lovelace'], 'must pass the old and new username');
});

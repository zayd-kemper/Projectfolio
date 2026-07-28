const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// utils/portfolioCacheInvalidation.js owns the cache invalidation that has to
// resolve an OWNER rather than trust the caller (collaborators edit projects they
// do not own). We stub ../config/database and ./cache so requiring it never
// touches a real Postgres/Redis connection.

const originalLoad = Module._load;
let dbQueries = [];
let dbRows = [];
let invalidatedUsers = [];
let invalidatedTeams = [];

const stubCache = () => ({
  invalidatePortfolio: async () => {},
  invalidatePublicUser: async (username) => { invalidatedUsers.push(username); },
  invalidateTeam: async (slug) => { invalidatedTeams.push(slug); },
});

// Some helpers issue two different lookups (owner, then team slugs), so the stub
// dispatches on the SQL rather than returning one fixed row set.
let dbRowsByTable = null;

Module._load = function (request, parent, isMain) {
  if (request === '../config/database') {
    return {
      query: async (sql, params) => {
        dbQueries.push({ sql, params });
        if (dbRowsByTable) {
          if (/team_projects/.test(sql)) return { rows: dbRowsByTable.teamSlugs || [] };
          if (/FROM teams/.test(sql)) return { rows: dbRowsByTable.team || [] };
          return { rows: dbRowsByTable.owner || [] };
        }
        return { rows: dbRows };
      },
    };
  }
  if (request === './cache') return stubCache();
  return originalLoad(request, parent, isMain);
};

const invalidation = require('../utils/portfolioCacheInvalidation');
Module._load = originalLoad;

test.beforeEach(() => {
  dbQueries = [];
  dbRows = [];
  dbRowsByTable = null;
  invalidatedUsers = [];
  invalidatedTeams = [];
});

// The collaborator join/remove routes hold only a project id — req.user is the
// collaborator, not the owner — so the owner must be resolved from the project row.
test('invalidateForProjectId resolves the owner from the project and invalidates them plus affected teams', async () => {
  dbRowsByTable = { owner: [{ username: 'ada' }], teamSlugs: [{ slug: 'rocketry' }] };
  await invalidation.invalidateForProjectId('project-9');
  assert.deepEqual(invalidatedUsers, ['ada'], "must invalidate the project OWNER, not the caller");
  assert.deepEqual(invalidatedTeams, ['rocketry']);
});

// PUT /auth/profile can change the username, and the cache is keyed by username —
// so a rename must clear the OLD key too, or the renamed-away name keeps serving
// the old portfolio until the TTL expires.
test('invalidateForProfileUpdate clears both the old and the new username on a rename', async () => {
  await invalidation.invalidateForProfileUpdate('ada', 'ada-lovelace');
  assert.deepEqual(invalidatedUsers, ['ada', 'ada-lovelace']);
  invalidatedUsers = [];
  await invalidation.invalidateForProfileUpdate('ada', 'ada');
  assert.deepEqual(invalidatedUsers, ['ada'], 'no rename means one invalidation, not two');
});

test('findAffectedTeamSlugs looks up team_projects joined to teams for the given project', async () => {
  dbRows = [{ slug: 'rocketry' }, { slug: 'aero-club' }];
  const slugs = await invalidation.findAffectedTeamSlugs('project-1');
  assert.deepEqual(slugs, ['rocketry', 'aero-club']);
  assert.equal(dbQueries.length, 1);
  assert.equal(dbQueries[0].params[0], 'project-1');
  assert.match(dbQueries[0].sql, /team_projects/);
  assert.match(dbQueries[0].sql, /teams/);
});

test('findAffectedTeamSlugs never rejects even when the lookup query throws', async () => {
  const slugs = await invalidation.findAffectedTeamSlugs('project-1', async () => {
    throw new Error('db unavailable');
  });
  assert.deepEqual(slugs, []);
});

test('invalidateProjectCaches invalidates the owner and every affected team slug', async () => {
  await invalidation.invalidateProjectCaches('ada', ['rocketry', 'aero-club']);
  assert.deepEqual(invalidatedUsers, ['ada']);
  assert.deepEqual(invalidatedTeams, ['rocketry', 'aero-club']);
});

// blocks/sync holds a pooled client across COMMIT and calls findAffectedTeamSlugs
// before releasing it. Passing an explicit executor (client.query.bind(client))
// must route the lookup through that held connection instead of checking out a
// second one via the module-level pooled `query` — see the pool-exhaustion bug
// this guards against in routes/projects.js.
test('findAffectedTeamSlugs uses the given executor instead of the pooled query when one is passed', async () => {
  dbRows = [{ slug: 'wrong-connection' }]; // what the pooled `query` stub would return if wrongly invoked
  const executorCalls = [];
  const executor = async (sql, params) => {
    executorCalls.push({ sql, params });
    return { rows: [{ slug: 'held-connection-team' }] };
  };
  const slugs = await invalidation.findAffectedTeamSlugs('project-2', executor);
  assert.deepEqual(slugs, ['held-connection-team']);
  assert.equal(executorCalls.length, 1);
  assert.equal(executorCalls[0].params[0], 'project-2');
  assert.equal(dbQueries.length, 0, 'the pooled query must not be called when an executor is provided');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// routes/projects.js exports the router with a couple of local cache-invalidation
// helpers attached, the same pattern routes/agent.js already uses for
// shouldBlockApplyForBrowserVerification / buildVisualResetSettings (see
// test/agentRoute.test.js). We stub ../config/database and ../utils/cache so
// requiring the route module never touches a real Postgres/Redis connection.

const originalLoad = Module._load;
let dbQueries = [];
let dbRows = [];
let invalidatedUsers = [];
let invalidatedTeams = [];

Module._load = function (request, parent, isMain) {
  if (request === '../config/database') {
    return {
      query: async (sql, params) => {
        dbQueries.push({ sql, params });
        return { rows: dbRows };
      },
      pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    };
  }
  if (request === '../utils/cache') {
    return {
      invalidatePortfolio: async () => {},
      invalidatePublicUser: async (username) => { invalidatedUsers.push(username); },
      invalidateTeam: async (slug) => { invalidatedTeams.push(slug); },
    };
  }
  return originalLoad(request, parent, isMain);
};

const projectsRouter = require('../routes/projects');
Module._load = originalLoad;

test.beforeEach(() => {
  dbQueries = [];
  dbRows = [];
  invalidatedUsers = [];
  invalidatedTeams = [];
});

test('findAffectedTeamSlugs looks up team_projects joined to teams for the given project', async () => {
  dbRows = [{ slug: 'rocketry' }, { slug: 'aero-club' }];
  const slugs = await projectsRouter.findAffectedTeamSlugs('project-1');
  assert.deepEqual(slugs, ['rocketry', 'aero-club']);
  assert.equal(dbQueries.length, 1);
  assert.equal(dbQueries[0].params[0], 'project-1');
  assert.match(dbQueries[0].sql, /team_projects/);
  assert.match(dbQueries[0].sql, /teams/);
});

test('findAffectedTeamSlugs never rejects even when the lookup query throws', async () => {
  Module._load = function (request, parent, isMain) {
    if (request === '../config/database') {
      return {
        query: async () => { throw new Error('db unavailable'); },
        pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
      };
    }
    if (request === '../utils/cache') {
      return {
        invalidatePortfolio: async () => {},
        invalidatePublicUser: async () => {},
        invalidateTeam: async () => {},
      };
    }
    return originalLoad(request, parent, isMain);
  };
  delete require.cache[require.resolve('../routes/projects')];
  const freshRouter = require('../routes/projects');
  Module._load = originalLoad;
  const slugs = await freshRouter.findAffectedTeamSlugs('project-1');
  assert.deepEqual(slugs, []);
});

test('invalidateProjectCaches invalidates the owner and every affected team slug', async () => {
  await projectsRouter.invalidateProjectCaches('ada', ['rocketry', 'aero-club']);
  assert.deepEqual(invalidatedUsers, ['ada']);
  assert.deepEqual(invalidatedTeams, ['rocketry', 'aero-club']);
});

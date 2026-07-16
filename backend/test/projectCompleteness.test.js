const test = require('node:test');
const assert = require('node:assert');
const {
  scoreProjectCompleteness,
  hasQualifiedProject,
  AI_TOOLS_GATE_MESSAGE,
  MIN_AI_TOOLS_COMPLETENESS,
} = require('../utils/projectCompleteness');

test('empty project scores 0', () => {
  assert.equal(scoreProjectCompleteness({}), 0);
  assert.equal(scoreProjectCompleteness(), 0);
});

test('scoring mirrors the dashboard completeness weights', () => {
  assert.equal(scoreProjectCompleteness({ cover_image_url: 'https://cdn/img.png' }), 20);
  assert.equal(scoreProjectCompleteness({ tagline: 'A tagline' }), 15);
  assert.equal(scoreProjectCompleteness({ tagline: '   ' }), 0);
  assert.equal(scoreProjectCompleteness({ description: 'Words' }), 10);
  assert.equal(scoreProjectCompleteness({ technologies: ['react'] }), 0);
  assert.equal(scoreProjectCompleteness({ technologies: ['react', 'node'] }), 15);
  assert.equal(scoreProjectCompleteness({ start_date: '2026-01-01' }), 10);
  assert.equal(scoreProjectCompleteness({ github_url: 'https://github.com/x/y' }), 15);
  assert.equal(scoreProjectCompleteness({ live_url: 'https://demo.example' }), 15);
  assert.equal(scoreProjectCompleteness({ project_type: 'software' }), 5);
  assert.equal(scoreProjectCompleteness({ view_count: 3 }), 5);
  assert.equal(scoreProjectCompleteness({ view_count: 0 }), 0);
  assert.equal(scoreProjectCompleteness({ is_featured: true }), 5);
});

test('a fully filled project caps at 100', () => {
  const full = {
    cover_image_url: 'x', tagline: 't', description: 'd',
    technologies: ['a', 'b', 'c'], start_date: '2026-01-01',
    github_url: 'g', live_url: 'l', project_type: 'software',
    view_count: 50, is_featured: true,
  };
  assert.equal(scoreProjectCompleteness(full), 100);
});

test('technologies stored as a JSON string still count', () => {
  assert.equal(scoreProjectCompleteness({ technologies: '["react","node"]' }), 15);
  assert.equal(scoreProjectCompleteness({ technologies: 'not-json' }), 0);
});

test('hasQualifiedProject is true when any owned project reaches the minimum', async () => {
  // 20 (cover) + 15 (tagline) + 15 (github) = 50 — exactly at threshold qualifies
  const rows = [
    { tagline: 'weak project' },
    { cover_image_url: 'x', tagline: 't', github_url: 'https://github.com/x/y' },
  ];
  const calls = [];
  const queryFn = async (text, params) => { calls.push({ text, params }); return { rows }; };
  assert.equal(await hasQualifiedProject('user-1', { queryFn }), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['user-1']);
  assert.match(calls[0].text, /FROM projects/i);
  assert.match(calls[0].text, /user_id = \$1/);
});

test('hasQualifiedProject is false when no project reaches the minimum', async () => {
  const queryFn = async () => ({ rows: [{ tagline: 't', description: 'd' }] }); // 25
  assert.equal(await hasQualifiedProject('user-1', { queryFn }), false);
});

test('hasQualifiedProject is false for a user with no projects', async () => {
  const queryFn = async () => ({ rows: [] });
  assert.equal(await hasQualifiedProject('user-1', { queryFn }), false);
});

test('threshold and gate message', () => {
  assert.equal(MIN_AI_TOOLS_COMPLETENESS, 50);
  assert.match(AI_TOOLS_GATE_MESSAGE, /50%/);
  assert.match(AI_TOOLS_GATE_MESSAGE, /project/i);
});

const integrationsRouter = require('../routes/integrations');

test('requireQualifiedProject blocks unqualified users with 403 and the gate message', async () => {
  const middleware = integrationsRouter.requireQualifiedProject(async () => false);
  let statusCode = null;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
  };
  await middleware({ user: { id: 'u1' } }, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(payload.error, AI_TOOLS_GATE_MESSAGE);
  assert.equal(payload.code, 'AI_TOOLS_PROJECT_GATE');
  assert.equal(nextCalled, false);
});

test('requireQualifiedProject passes qualified users through to next()', async () => {
  const middleware = integrationsRouter.requireQualifiedProject(async () => true);
  let nextCalled = false;
  const res = {
    status() { throw new Error('should not respond'); },
    json() { throw new Error('should not respond'); },
  };
  await middleware({ user: { id: 'u1' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireQualifiedProject forwards check errors to next(err)', async () => {
  const boom = new Error('db down');
  const middleware = integrationsRouter.requireQualifiedProject(async () => { throw boom; });
  let forwarded = null;
  await middleware({ user: { id: 'u1' } }, {}, (err) => { forwarded = err; });
  assert.equal(forwarded, boom);
});

test('respondUnqualified sends the 403 gate payload and reports true only for unqualified users', async () => {
  let statusCode = null;
  let payload = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
  };
  const denied = await integrationsRouter.respondUnqualified({ user: { id: 'u1' } }, res, async () => false);
  assert.equal(denied, true);
  assert.equal(statusCode, 403);
  assert.equal(payload.error, AI_TOOLS_GATE_MESSAGE);
  assert.equal(payload.code, 'AI_TOOLS_PROJECT_GATE');
  const allowed = await integrationsRouter.respondUnqualified({ user: { id: 'u1' } }, { status() { throw new Error('no'); }, json() { throw new Error('no'); } }, async () => true);
  assert.equal(allowed, false);
});

test('integration jobs are gated before the handler runs', async () => {
  let handlerRan = false;
  const handler = async () => { handlerRan = true; };
  const queryFn = async () => ({ rows: [{ id: 'u1', email: 'e', username: 'u', full_name: 'f', avatar_url: null }] });
  await assert.rejects(
    () => integrationsRouter.invokeIntegrationHandler(handler, { userId: 'u1', body: {} }, { queryFn, checkFn: async () => false }),
    (err) => err.message === AI_TOOLS_GATE_MESSAGE
  );
  assert.equal(handlerRan, false);
});

test('integration jobs run the handler for qualified users', async () => {
  const queryFn = async () => ({ rows: [{ id: 'u1', email: 'e', username: 'u', full_name: 'f', avatar_url: null }] });
  const result = await integrationsRouter.invokeIntegrationHandler(
    async (req, res) => res.json({ ok: true, userId: req.user.id }),
    { userId: 'u1', body: {} },
    { queryFn, checkFn: async () => true }
  );
  assert.deepEqual(result, { ok: true, userId: 'u1' });
});

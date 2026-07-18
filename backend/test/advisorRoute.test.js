const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const advisorRouter = require('../routes/advisor');

test('create-session payload validation enforces the objective and growth enums', () => {
  const valid = advisorRouter.checkCreatePayload({
    objective: 'projects',
    growth: 'vertical',
    focus_note: 'embedded systems',
    target_role: 'Autonomy intern',
    timeframe_weeks: 12,
  });
  assert.equal(valid.ok, true);

  const invalid = advisorRouter.checkCreatePayload({ objective: 'fame', growth: 'sideways' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length >= 2, 'both bad enum values are reported');

  const missing = advisorRouter.checkCreatePayload({});
  assert.equal(missing.ok, false);
});

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

test('createSession stores the goals, enqueues the generate job, and returns 202', async () => {
  const db = require('../config/database');
  const jobsService = require('../jobs/service');

  const queries = [];
  db.query = async (text, params) => {
    queries.push({ text, params });
    if (/INSERT INTO advisor_sessions/.test(text)) {
      return { rows: [{ id: 'sess-1', status: 'generating', created_at: '2026-07-17T00:00:00Z' }] };
    }
    return { rows: [] };
  };
  let jobOptions = null;
  jobsService.createJob = async (options) => { jobOptions = options; return { id: 'job-1', status: 'queued' }; };

  const res = makeRes();
  await advisorRouter.handlers.createSession({
    user: { id: 'user-1' },
    body: { objective: 'projects', growth: 'vertical', focus_note: 'aerial autonomy', timeframe_weeks: 12 },
    get: () => null,
  }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.session_id, 'sess-1');
  assert.equal(res.body.job_id, 'job-1');
  assert.equal(res.body.status, 'generating');

  assert.equal(jobOptions.type, 'advisor:generate');
  assert.deepEqual(jobOptions.input, { userId: 'user-1', sessionId: 'sess-1' });

  const insert = queries.find((entry) => /INSERT INTO advisor_sessions/.test(entry.text));
  const goals = JSON.parse(insert.params[1]);
  assert.equal(goals.growth, 'vertical');
  assert.equal(goals.focus_note, 'aerial autonomy');
  assert.equal(goals.timeframe_weeks, 12);
  assert.ok(queries.some((entry) => /SET job_id/.test(entry.text)), 'job id is written back to the session');
});

test('updateStep only accepts roadmap steps that exist and persists the check-off', async () => {
  const db = require('../config/database');
  const session = {
    id: 'sess-1',
    user_id: 'user-1',
    status: 'ready',
    package: { roadmap: { steps: [{ id: 'step-1' }, { id: 'step-2' }] } },
    progress: {},
  };
  const queries = [];
  db.query = async (text, params) => {
    queries.push({ text, params });
    if (/^SELECT/.test(text.trim())) return { rows: [session] };
    if (/SET progress/.test(text)) return { rows: [{ progress: JSON.parse(params[1]) }] };
    return { rows: [] };
  };

  const res = makeRes();
  await advisorRouter.handlers.updateStep({
    user: { id: 'user-1' },
    params: { id: 'sess-1', stepId: 'step-1' },
    body: { completed: true },
  }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.progress['step-1'].completed, true);
  assert.ok(res.body.progress['step-1'].completed_at, 'completion timestamp is recorded');

  const unknownStep = makeRes();
  await advisorRouter.handlers.updateStep({
    user: { id: 'user-1' },
    params: { id: 'sess-1', stepId: 'step-99' },
    body: { completed: true },
  }, unknownStep, (error) => { throw error; });
  assert.equal(unknownStep.statusCode, 422, 'a step outside the roadmap is rejected');

  const unchecked = makeRes();
  await advisorRouter.handlers.updateStep({
    user: { id: 'user-1' },
    params: { id: 'sess-1', stepId: 'step-1' },
    body: { completed: false },
  }, unchecked, (error) => { throw error; });
  assert.equal(unchecked.statusCode, 200);
  assert.equal(unchecked.body.progress['step-1'], undefined, 'unchecking removes the entry');
});

test('session lifecycle handlers scope to the user and 404 on missing sessions', async () => {
  const db = require('../config/database');
  const jobsService = require('../jobs/service');

  const queries = [];
  db.query = async (text, params) => {
    queries.push({ text, params });
    if (/WHERE user_id = \$1/.test(text)) {
      return { rows: [{ id: 's1', status: 'ready', goals: { objective: 'projects' }, created_at: 'x', updated_at: 'x' }] };
    }
    if (/SET status = 'generating'/.test(text)) return { rows: [{ id: 's1' }] };
    return { rows: [] };
  };
  jobsService.createJob = async () => ({ id: 'job-2', status: 'queued' });

  const list = makeRes();
  await advisorRouter.handlers.listSessions({ user: { id: 'user-1' }, query: {} }, list, (error) => { throw error; });
  assert.deepEqual(list.body.sessions.map((entry) => entry.id), ['s1']);
  const listQuery = queries.find((entry) => /WHERE user_id = \$1/.test(entry.text));
  assert.ok(!/package/.test(listQuery.text), 'the history list does not ship the heavy package column');

  const missing = makeRes();
  await advisorRouter.handlers.getSession({ user: { id: 'user-1' }, params: { id: 'nope' } }, missing, (error) => { throw error; });
  assert.equal(missing.statusCode, 404);

  const gone = makeRes();
  await advisorRouter.handlers.deleteSession({ user: { id: 'user-1' }, params: { id: 'nope' } }, gone, (error) => { throw error; });
  assert.equal(gone.statusCode, 404);

  const regenerated = makeRes();
  await advisorRouter.handlers.regenerateSession({ user: { id: 'user-1' }, params: { id: 's1' }, get: () => null }, regenerated, (error) => { throw error; });
  assert.equal(regenerated.statusCode, 202);
  assert.equal(regenerated.body.job_id, 'job-2');
});

test('the advisor is wired into the server, job processors, model profiles, and REST surface', () => {
  const processorsSource = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'processors.js'), 'utf8');
  assert.match(processorsSource, /registerProcessor\('advisor:generate'/);

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /app\.use\('\/api\/advisor',\s*require\('\.\/routes\/advisor'\)\)/);

  const { INTEGRATION_MODEL_PROFILES } = require('../utils/aiModels');
  const profile = INTEGRATION_MODEL_PROFILES.advisor;
  assert.ok(profile, 'an advisor model profile exists');
  assert.deepEqual(profile.requiredCapabilities, ['chat', 'json']);
  assert.ok(Array.isArray(profile.preferredModelIds) && profile.preferredModelIds.length > 0);

  const registered = advisorRouter.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
  // The public surface is /api/advisor/sessions... (the frontend calls
  // api.post('/advisor/sessions')), so the router paths carry the /sessions prefix.
  for (const expected of ['POST /sessions', 'GET /sessions', 'GET /sessions/:id', 'POST /sessions/:id/regenerate', 'PATCH /sessions/:id/steps/:stepId', 'DELETE /sessions/:id']) {
    assert.ok(registered.includes(expected), `route ${expected} is registered`);
  }
});

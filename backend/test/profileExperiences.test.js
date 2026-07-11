const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/database');
const profileRouter = require('../routes/profile');

test('server mounts the profile router at /api/profile', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /app\.use\('\/api\/profile',\s*require\('\.\/routes\/profile'\)\)/);
});

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

test('listExperiences queries by user and returns rows', async () => {
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 'e1', kind: 'employment', title: 'Intern' }] };
  };
  const res = makeRes();
  await profileRouter.handlers.listExperiences({ user: { id: 'u1' } }, res, (err) => { throw err; });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM profile_experiences/);
  assert.deepEqual(calls[0].params, ['u1']);
  assert.deepEqual(res.body.experiences, [{ id: 'e1', kind: 'employment', title: 'Intern' }]);
});

test('createExperience inserts with user id and returns 201 with the new row', async () => {
  let captured = null;
  db.query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ id: 'e2', kind: 'education', title: 'BSc' }] };
  };
  const res = makeRes();
  await profileRouter.handlers.createExperience({
    user: { id: 'u1' },
    body: { kind: 'education', title: 'BSc', organization: 'State U', field_of_study: 'ME' },
  }, res, (err) => { throw err; });
  assert.match(captured.sql, /INSERT INTO profile_experiences/);
  assert.equal(captured.params[0], 'u1');
  assert.equal(captured.params[1], 'education');
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.experience.id, 'e2');
});

test('updateExperience scopes by user, returns updated row, and 404s when not found', async () => {
  db.query = async (sql, params) => {
    assert.match(sql, /UPDATE profile_experiences/);
    assert.equal(params[0], 'e1');
    assert.equal(params[1], 'u1');
    return { rows: [{ id: 'e1', title: 'Senior Intern' }] };
  };
  const res = makeRes();
  await profileRouter.handlers.updateExperience({
    user: { id: 'u1' },
    params: { id: 'e1' },
    body: { kind: 'employment', title: 'Senior Intern', organization: 'Acme' },
  }, res, (err) => { throw err; });
  assert.equal(res.body.experience.title, 'Senior Intern');

  db.query = async () => ({ rows: [] });
  const notFound = makeRes();
  await profileRouter.handlers.updateExperience({
    user: { id: 'u1' },
    params: { id: 'missing' },
    body: { kind: 'employment', title: 'X', organization: 'Y' },
  }, notFound, (err) => { throw err; });
  assert.equal(notFound.statusCode, 404);
});

test('deleteExperience deletes by id scoped to user and 404s when missing', async () => {
  db.query = async (sql, params) => {
    assert.match(sql, /DELETE FROM profile_experiences/);
    assert.deepEqual(params, ['e1', 'u1']);
    return { rows: [{ id: 'e1' }] };
  };
  const res = makeRes();
  await profileRouter.handlers.deleteExperience({ user: { id: 'u1' }, params: { id: 'e1' } }, res, (err) => { throw err; });
  assert.equal(res.body.success, true);

  db.query = async () => ({ rows: [] });
  const notFound = makeRes();
  await profileRouter.handlers.deleteExperience({ user: { id: 'u1' }, params: { id: 'gone' } }, notFound, (err) => { throw err; });
  assert.equal(notFound.statusCode, 404);
});

test('reorderExperiences rewrites sort order from the given id list scoped to user and kind', async () => {
  let captured = null;
  db.query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [] };
  };
  const res = makeRes();
  await profileRouter.handlers.reorderExperiences({
    user: { id: 'u1' },
    body: { kind: 'employment', ids: ['b', 'a'] },
  }, res, (err) => { throw err; });
  assert.match(captured.sql, /UPDATE profile_experiences/);
  assert.match(captured.sql, /WITH ORDINALITY/);
  assert.deepEqual(captured.params, [['b', 'a'], 'u1', 'employment']);
  assert.equal(res.body.success, true);
});

test('experience payload validation accepts a valid employment entry and rejects a bad kind', () => {
  const valid = profileRouter.checkExperiencePayload({
    kind: 'employment',
    title: 'Software Engineering Intern',
    organization: 'Acme Robotics',
    location: 'Austin, TX',
    start_date: '2025-06-01',
    end_date: null,
    is_current: true,
    description: 'Built firmware test rigs.',
    highlights: ['Cut test cycle time by 40%'],
    skills: ['C++', 'Python'],
  });
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.equal(valid.value.kind, 'employment');

  const invalid = profileRouter.checkExperiencePayload({
    kind: 'hobby',
    title: '',
    organization: 'Acme',
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((e) => e.field === 'kind'));
});

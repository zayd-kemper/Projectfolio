const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/database');
const jobsService = require('../jobs/service');
const applicationsRouter = require('../routes/applications');

test('the generate processor is registered and the router is mounted', () => {
  const processorsSource = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'processors.js'), 'utf8');
  assert.match(processorsSource, /registerProcessor\('application:generate'/);
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /app\.use\('\/api\/applications',\s*require\('\.\/routes\/applications'\)\)/);
});

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

test('createApplication inserts a session, enqueues the generate job, and returns 202', async () => {
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    if (/INSERT INTO application_sessions/.test(sql)) {
      return { rows: [{ id: 's1', platform: 'greenhouse', status: 'generating' }] };
    }
    return { rows: [] };
  };
  let jobInput = null;
  jobsService.createJob = async (options) => {
    jobInput = options;
    return { id: 'j1', status: 'queued' };
  };

  const res = makeRes();
  await applicationsRouter.handlers.createApplication({
    user: { id: 'u1' },
    body: { platform: 'greenhouse', job_title: 'Design Engineer', company: 'Orbit' },
    get: () => null,
  }, res, (err) => { throw err; });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.session_id, 's1');
  assert.equal(res.body.job_id, 'j1');
  assert.equal(jobInput.type, 'application:generate');
  assert.deepEqual(jobInput.input, { userId: 'u1', sessionId: 's1' });
  assert.ok(queries.some(({ sql }) => /UPDATE application_sessions SET job_id/.test(sql)));
});

test('listSessions and getSession scope by user; getSession 404s when missing', async () => {
  db.query = async (sql, params) => {
    if (/SELECT id, platform, job_title, company, status, resume_url, created_at/.test(sql)) {
      assert.equal(params[0], 'u1');
      return { rows: [{ id: 's1', platform: 'greenhouse', status: 'ready' }] };
    }
    if (/FROM application_sessions WHERE id = \$1 AND user_id = \$2/.test(sql)) {
      return params[0] === 's1'
        ? { rows: [{ id: 's1', package: { version: 1 }, status: 'ready' }] }
        : { rows: [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  };

  const listRes = makeRes();
  await applicationsRouter.handlers.listSessions({ user: { id: 'u1' }, query: {} }, listRes, (err) => { throw err; });
  assert.equal(listRes.body.sessions.length, 1);

  const getRes = makeRes();
  await applicationsRouter.handlers.getSession({ user: { id: 'u1' }, params: { id: 's1' } }, getRes, (err) => { throw err; });
  assert.equal(getRes.body.session.package.version, 1);

  const missingRes = makeRes();
  await applicationsRouter.handlers.getSession({ user: { id: 'u1' }, params: { id: 's2' } }, missingRes, (err) => { throw err; });
  assert.equal(missingRes.statusCode, 404);
});

test('regenerateSession resets status, enqueues a new job, and 404s for foreign sessions', async () => {
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    if (/UPDATE application_sessions\s+SET status = 'generating'/.test(sql)) {
      return params[0] === 's1' ? { rows: [{ id: 's1' }] } : { rows: [] };
    }
    return { rows: [] };
  };
  jobsService.createJob = async (options) => {
    assert.equal(options.type, 'application:generate');
    return { id: 'j2', status: 'queued' };
  };

  const res = makeRes();
  await applicationsRouter.handlers.regenerateSession({
    user: { id: 'u1' }, params: { id: 's1' }, get: () => null,
  }, res, (err) => { throw err; });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.job_id, 'j2');

  const missing = makeRes();
  await applicationsRouter.handlers.regenerateSession({
    user: { id: 'u1' }, params: { id: 'nope' }, get: () => null,
  }, missing, (err) => { throw err; });
  assert.equal(missing.statusCode, 404);
});

test('deleteSession removes the row scoped to user', async () => {
  db.query = async (sql, params) => {
    assert.match(sql, /DELETE FROM application_sessions/);
    assert.deepEqual(params, ['s1', 'u1']);
    return { rows: [{ id: 's1' }] };
  };
  const res = makeRes();
  await applicationsRouter.handlers.deleteSession({ user: { id: 'u1' }, params: { id: 's1' } }, res, (err) => { throw err; });
  assert.equal(res.body.success, true);
});

test('listPlatforms returns the adapter catalog with capabilities and constraints', () => {
  const res = makeRes();
  applicationsRouter.handlers.listPlatforms({ user: { id: 'u1' } }, res, (err) => { throw err; });
  assert.ok(res.body.platforms.length >= 6);
  const greenhouse = res.body.platforms.find((p) => p.slug === 'greenhouse');
  assert.equal(greenhouse.capabilities.supportsResume, true);
  assert.equal(greenhouse.coverLetter.maxWords, 400);
  assert.ok(Array.isArray(greenhouse.tips));
});

test('downloadResume streams the PDF through an authenticated Cloudinary download URL', async () => {
  db.query = async (sql, params) => {
    assert.match(sql, /FROM application_sessions/);
    assert.deepEqual(params, ['s1', 'u1']);
    return { rows: [{ id: 's1', user_id: 'u1', status: 'ready', package: { resume: { filename: 'jane-greenhouse-resume.pdf' } } }] };
  };
  const { cloudinary } = require('../config/cloudinary');
  cloudinary.utils.private_download_url = (publicId, format, options) => {
    assert.equal(publicId, 'projectfolio/applications/u1-s1.pdf');
    assert.equal(options.resource_type, 'raw');
    return 'https://api.cloudinary.test/download?sig=1';
  };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.cloudinary.test/download?sig=1');
    return { ok: true, arrayBuffer: async () => Buffer.from('%PDF-1.4 fake').buffer };
  };

  const headers = {};
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { headers[name] = value; },
    send(buffer) { this.body = buffer; return this; },
  };
  try {
    await applicationsRouter.handlers.downloadResume({ user: { id: 'u1' }, params: { id: 's1' } }, res, (err) => { throw err; });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.match(headers['Content-Disposition'], /jane-greenhouse-resume\.pdf/);
  assert.ok(Buffer.isBuffer(res.body));
});

test('create payload validation accepts a valid request and rejects unknown platforms', () => {
  const valid = applicationsRouter.checkCreatePayload({
    platform: 'greenhouse',
    job_title: 'Design Engineer',
    company: 'Orbit Dynamics',
    job_posting_url: 'https://jobs.example/1',
    notes: 'Referral from Sam',
  });
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));

  const invalid = applicationsRouter.checkCreatePayload({ platform: 'monster' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((e) => e.field === 'platform'));
});

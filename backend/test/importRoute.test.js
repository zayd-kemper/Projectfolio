const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const jobsService = require('../jobs/service');
const importRouter = require('../routes/import');

test('processor is registered and the router is mounted', () => {
  const processors = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'processors.js'), 'utf8');
  assert.match(processors, /registerProcessor\('github-import'/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /app\.use\('\/api\/import',\s*require\('\.\/routes\/import'\)\)/);
});

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

test('createImport rejects a bad URL and enqueues a job for a valid repo URL', async () => {
  const bad = makeRes();
  await importRouter.handlers.createImport({ user: { id: 'u1' }, body: { url: 'https://gitlab.com/o/r' }, get: () => null }, bad, (err) => { throw err; });
  assert.equal(bad.statusCode, 400);

  let jobInput = null;
  jobsService.createJob = async (options) => { jobInput = options; return { id: 'j1', status: 'queued' }; };
  const ok = makeRes();
  await importRouter.handlers.createImport({ user: { id: 'u1' }, body: { url: 'https://github.com/jane/proj' }, get: () => null }, ok, (err) => { throw err; });
  assert.equal(ok.statusCode, 202);
  assert.equal(ok.body.job_id, 'j1');
  assert.equal(jobInput.type, 'github-import');
  assert.equal(jobInput.input.url, 'https://github.com/jane/proj');
  assert.equal(jobInput.input.userId, 'u1');
});

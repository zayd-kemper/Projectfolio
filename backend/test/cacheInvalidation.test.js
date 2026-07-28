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

test('invalidatePublicUser never rejects even when the underlying Redis calls throw', async () => {
  const originalScan = fakeRedis.scan;
  const originalDel = fakeRedis.del;
  fakeRedis.scan = async () => { throw new Error('redis unavailable'); };
  fakeRedis.del = async () => { throw new Error('redis unavailable'); };
  try {
    await assert.doesNotReject(() => invalidatePublicUser('ada'));
  } finally {
    fakeRedis.scan = originalScan;
    fakeRedis.del = originalDel;
  }
});

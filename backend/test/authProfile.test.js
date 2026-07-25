const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the two modules authProfile depends on before requiring it.
const Module = require('node:module');
const originalLoad = Module._load;
let queryCalls = [];
let queryResult = { rows: [] };
let redisStore = null;

Module._load = function (request, parent, isMain) {
  if (request === '../config/database') {
    return {
      query: async (sql, params) => {
        queryCalls.push({ sql, params });
        return queryResult;
      },
    };
  }
  if (request === '../config/redis') {
    return { getRedis: () => redisStore };
  }
  return originalLoad(request, parent, isMain);
};

const { loadAuthProfile, invalidateAuthProfile } = require('../utils/authProfile');
Module._load = originalLoad;

const PROFILE = {
  id: 'u-1', email: 'a@b.com', username: 'ab',
  full_name: 'A B', avatar_url: null,
};

test.beforeEach(() => {
  queryCalls = [];
  queryResult = { rows: [PROFILE] };
  redisStore = null;
});

test('loadAuthProfile reads the profile from the users table', async () => {
  const profile = await loadAuthProfile('u-1');
  assert.deepEqual(profile, PROFILE);
  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0].sql, /FROM users/i);
  assert.deepEqual(queryCalls[0].params, ['u-1']);
});

test('loadAuthProfile returns null when the profile is missing', async () => {
  queryResult = { rows: [] };
  assert.equal(await loadAuthProfile('nope'), null);
});

test('loadAuthProfile serves a cached profile without hitting the database', async () => {
  const store = new Map();
  redisStore = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v); },
    del: async (k) => { store.delete(k); },
  };
  await loadAuthProfile('u-1');
  assert.equal(queryCalls.length, 1);
  await loadAuthProfile('u-1');
  assert.equal(queryCalls.length, 1, 'second call must be served from cache');
});

test('invalidateAuthProfile forces the next read back to the database', async () => {
  const store = new Map();
  redisStore = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v); },
    del: async (k) => { store.delete(k); },
  };
  await loadAuthProfile('u-1');
  await invalidateAuthProfile('u-1');
  await loadAuthProfile('u-1');
  assert.equal(queryCalls.length, 2);
});

test('loadAuthProfile survives a broken redis', async () => {
  redisStore = {
    get: async () => { throw new Error('redis down'); },
    set: async () => { throw new Error('redis down'); },
    del: async () => { throw new Error('redis down'); },
  };
  assert.deepEqual(await loadAuthProfile('u-1'), PROFILE);
});

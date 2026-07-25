const test = require('node:test');
const assert = require('node:assert/strict');

// Stub the two modules middleware/auth.js depends on before requiring it.
const Module = require('node:module');
const originalLoad = Module._load;
let verifyImpl = async () => { throw new Error('not configured'); };
let profileImpl = async () => null;

Module._load = function (request, parent, isMain) {
  if (request === '../utils/supabaseJwt') {
    return { verifySupabaseToken: (token) => verifyImpl(token) };
  }
  if (request === '../utils/authProfile') {
    return { loadAuthProfile: (userId) => profileImpl(userId) };
  }
  return originalLoad(request, parent, isMain);
};

const { requireAuth, optionalAuth } = require('../middleware/auth');
Module._load = originalLoad;

const makeRes = () => {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test.beforeEach(() => {
  verifyImpl = async () => { throw new Error('not configured'); };
  profileImpl = async () => null;
});

test('requireAuth returns 401 when no Authorization header is present', async () => {
  const req = { headers: {} };
  const res = makeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'AUTH_REQUIRED');
});

test('requireAuth verifies the bearer token, loads the profile, and sets req.user', async () => {
  const seenTokens = [];
  const seenIds = [];
  verifyImpl = async (token) => { seenTokens.push(token); return { sub: 'u-1', email: 'jwt@example.com' }; };
  profileImpl = async (userId) => {
    seenIds.push(userId);
    return { id: 'u-1', email: 'profile@example.com', username: 'ab', full_name: 'A B', avatar_url: null };
  };
  const req = { headers: { authorization: 'Bearer my-token' } };
  const res = makeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(seenTokens, ['my-token']);
  assert.deepEqual(seenIds, ['u-1']);
  assert.deepEqual(req.user, {
    id: 'u-1', email: 'profile@example.com', username: 'ab', full_name: 'A B', avatar_url: null,
  });
});

test('requireAuth reports token expiry distinctly', async () => {
  verifyImpl = async () => {
    const error = new Error('exp claim timestamp check failed');
    error.code = 'ERR_JWT_EXPIRED';
    throw error;
  };
  const req = { headers: { authorization: 'Bearer expired-token' } };
  const res = makeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Access token expired.');
  assert.equal(res.body.code, 'AUTH_REQUIRED');
});

test('requireAuth reports a distinct message when no profile exists yet', async () => {
  verifyImpl = async () => ({ sub: 'brand-new-user', email: 'new@example.com' });
  profileImpl = async () => null;
  const req = { headers: { authorization: 'Bearer new-token' } };
  const res = makeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Your account is still being set up. Please try again in a moment.');
  assert.equal(res.body.code, 'AUTH_REQUIRED');
});

test('optionalAuth sets req.user from a valid Supabase token via the same profile resolution', async () => {
  verifyImpl = async () => ({ sub: 'u-2', email: 'jwt@example.com' });
  profileImpl = async () => ({ id: 'u-2', email: 'profile@example.com', username: 'cd', full_name: 'C D', avatar_url: null });
  const req = { headers: { authorization: 'Bearer optional-token' } };
  const res = makeRes();
  let nextCalled = false;
  await optionalAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, {
    id: 'u-2', email: 'profile@example.com', username: 'cd', full_name: 'C D', avatar_url: null,
  });
});

test('optionalAuth calls next without req.user when no token is present', async () => {
  const req = { headers: {} };
  const res = makeRes();
  let nextCalled = false;
  await optionalAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user, undefined);
});

test('optionalAuth swallows a verification error and proceeds anonymously', async () => {
  verifyImpl = async () => { throw new Error('boom'); };
  const req = { headers: { authorization: 'Bearer bad-token' } };
  const res = makeRes();
  let nextCalled = false;
  await optionalAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user, undefined);
});

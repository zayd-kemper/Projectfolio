const test = require('node:test');
const assert = require('node:assert/strict');
const passport = require('../config/passport');

// githubVerify takes an injected `query` so the account-linking branches can be
// exercised without a live database.
const capture = () => {
  const out = {};
  return [(err, user) => { out.err = err; out.user = user; }, out];
};

test('githubVerify returns the existing user when github_id already matches', async () => {
  const query = async (sql, params) => {
    if (/WHERE github_id = \$1/.test(sql)) {
      return { rows: params[0] === 'gh-123' ? [{ id: 'u1', email: 'dev@example.com', github_id: 'gh-123' }] : [] };
    }
    return { rows: [] };
  };
  const [done, out] = capture();
  await passport.githubVerify(query, { id: 'gh-123', username: 'dev', emails: [{ value: 'dev@example.com' }] }, done);
  assert.equal(out.err, null);
  assert.equal(out.user.id, 'u1');
});

test('githubVerify links github_id onto an existing account that shares the email', async () => {
  const updates = [];
  const query = async (sql, params) => {
    if (/WHERE github_id = \$1/.test(sql)) return { rows: [] };
    if (/WHERE email = \$1/.test(sql)) return { rows: [{ id: 'u2', email: 'shared@example.com' }] };
    if (/UPDATE users SET github_id/.test(sql)) { updates.push(params); return { rows: [] }; }
    return { rows: [] };
  };
  const [done, out] = capture();
  await passport.githubVerify(query, { id: 'gh-9', username: 'shared', emails: [{ value: 'shared@example.com' }] }, done);
  assert.equal(out.err, null);
  assert.equal(out.user.id, 'u2');
  assert.equal(updates.length, 1, 'links the github id to the matched account');
});

test('githubVerify creates a new user + portfolio settings when github id and email are both new', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push(sql);
    if (/INSERT INTO users/.test(sql)) return { rows: [{ id: 'new-1', email: params[0], username: params[2] }] };
    return { rows: [] };
  };
  const [done, out] = capture();
  await passport.githubVerify(query, {
    id: 'gh-new', username: 'neo', displayName: 'Neo Dev',
    profileUrl: 'https://github.com/neo', emails: [{ value: 'neo@example.com' }],
    photos: [{ value: 'https://avatars.example/neo.png' }],
  }, done);
  assert.equal(out.err, null);
  assert.equal(out.user.id, 'new-1');
  assert.ok(calls.some((s) => /INSERT INTO portfolio_settings/.test(s)), 'seeds default portfolio settings');
});

test('githubVerify errors when GitHub returns no usable email', async () => {
  // Realistic mock: lookups miss, but a create would succeed — so a green here can
  // only come from an explicit no-email guard, not from an incidental crash.
  const query = async (sql, params) => {
    if (/INSERT INTO users/.test(sql)) return { rows: [{ id: 'should-not-happen', email: params[0] }] };
    return { rows: [] };
  };
  const [done, out] = capture();
  await passport.githubVerify(query, { id: 'gh-x', username: 'noemail', emails: [] }, done);
  assert.ok(out.err instanceof Error);
  assert.equal(out.user, null);
});

test('the github passport strategy is registered', () => {
  assert.ok(passport._strategy('github'), 'github strategy is available for passport.authenticate');
});

test('oauth router exposes the GitHub login and callback routes', () => {
  const oauthRouter = require('../routes/oauth');
  const paths = oauthRouter.stack.filter((l) => l.route).map((l) => l.route.path);
  assert.ok(paths.includes('/github'), 'GET /github is registered');
  assert.ok(paths.includes('/github/callback'), 'GET /github/callback is registered');
});

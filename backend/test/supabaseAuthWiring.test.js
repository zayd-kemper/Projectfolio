// Structural assertions over the Supabase Auth wiring in server.js and
// routes/analytics.js. Follows the same read-the-source pattern as
// scalability.test.js: these are deployment-shape guarantees that would
// otherwise only fail in production, where a missing env guard means the
// process boots without the credentials it needs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('production boot requires the Supabase Auth credentials', () => {
  const server = read('server.js');
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.match(server, new RegExp(`'${name}'`), `${name} must be a production boot check`);
  }
  assert.match(server, /ANALYTICS_VISITOR_SECRET/, 'ANALYTICS_VISITOR_SECRET must be a production boot check');
});

test('readiness reports whether the auth profile triggers are installed', () => {
  const server = read('server.js');
  // Without these triggers a signup lands in auth.users with no public.users
  // profile, and every later authed request 401s with PROFILE_MISSING.
  assert.match(server, /on_auth_user_created/);
  assert.match(server, /on_auth_user_email_sync/);
  assert.match(server, /auth_trigger_count/);
  assert.match(server, /Supabase Auth profile triggers are missing/);
});

test('the polling rate limiter keys on a verified Supabase subject', () => {
  const server = read('server.js');
  assert.match(server, /subjectFromToken/, 'keyGenerator must verify the token, not decode it');
  assert.match(server, /keyGenerator: async \(req\)/, 'keyGenerator must be async to await verification');
});

test('the analytics visitor secret has no JWT_SECRET fallback', () => {
  const analytics = read('routes/analytics.js');
  assert.doesNotMatch(analytics, /JWT_SECRET/, 'the JWT_SECRET fallback must be gone');
  assert.match(analytics, /ANALYTICS_VISITOR_SECRET/);
});

test('sessions and passport are fully unwired from the server', () => {
  const server = read('server.js');
  assert.doesNotMatch(server, /express-session/);
  assert.doesNotMatch(server, /connect-redis/);
  assert.doesNotMatch(server, /SessionRedisStore/);
  assert.doesNotMatch(server, /routes\/oauth/);
  assert.doesNotMatch(server, /JWT_SECRET|SESSION_SECRET/);
});

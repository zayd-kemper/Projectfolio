const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// jose v5 is ESM-only; node:test supports top-level dynamic import in an async setup.
let jose;
let keyPair;
let jwksServer;
let jwksOrigin;

test.before(async () => {
  jose = await import('jose');
  keyPair = await jose.generateKeyPair('ES256', { extractable: true });
  const jwk = await jose.exportJWK(keyPair.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  const body = JSON.stringify({ keys: [jwk] });
  jwksServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  });
  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksOrigin = `http://127.0.0.1:${jwksServer.address().port}`;
  process.env.SUPABASE_URL = jwksOrigin;
});

test.after(() => new Promise((resolve) => jwksServer.close(resolve)));

const sign = async (claims, { expiresIn = '1h' } = {}) =>
  new jose.SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setIssuer(`${jwksOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(keyPair.privateKey);

test('verifySupabaseToken returns the payload for a valid token', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const token = await sign({ sub: '11111111-1111-1111-1111-111111111111', email: 'a@b.com' });
  const payload = await verifySupabaseToken(token);
  assert.equal(payload.sub, '11111111-1111-1111-1111-111111111111');
  assert.equal(payload.email, 'a@b.com');
});

test('verifySupabaseToken rejects an expired token', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const token = await sign({ sub: 'u1' }, { expiresIn: '-1s' });
  await assert.rejects(() => verifySupabaseToken(token));
});

test('verifySupabaseToken rejects a token signed by a different key', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const other = await jose.generateKeyPair('ES256');
  const token = await new jose.SignJWT({ sub: 'u1', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setIssuer(`${jwksOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(other.privateKey);
  await assert.rejects(() => verifySupabaseToken(token));
});

test('verifySupabaseToken rejects a token from a different issuer', async () => {
  const { verifySupabaseToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  const token = await new jose.SignJWT({ sub: 'u1', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setIssuer('https://evil.example.com/auth/v1')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(keyPair.privateKey);
  await assert.rejects(() => verifySupabaseToken(token));
});

test('subjectFromToken returns null instead of throwing on a bad token', async () => {
  const { subjectFromToken, resetJwksCache } = require('../utils/supabaseJwt');
  resetJwksCache();
  assert.equal(await subjectFromToken('not-a-jwt'), null);
  const good = await sign({ sub: 'u-42' });
  assert.equal(await subjectFromToken(good), 'u-42');
});

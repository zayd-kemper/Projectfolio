// Verifies Supabase Auth (GoTrue) access tokens.
//
// The project signs with asymmetric ES256 keys, so verification is JWKS-only:
// there is deliberately no HS256 / SUPABASE_JWT_SECRET path. `jose` caches the
// key set in-process and refetches on unknown `kid`, so key rotation in the
// Supabase dashboard needs no redeploy.

let jwksPromise = null;
let cachedIssuer = null;

const supabaseOrigin = () => {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not configured.');
  return url.replace(/\/$/, '');
};

const getJose = () => import('jose');

const getJwks = async () => {
  const origin = supabaseOrigin();
  if (!jwksPromise || cachedIssuer !== origin) {
    cachedIssuer = origin;
    jwksPromise = getJose().then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(new URL(`${origin}/auth/v1/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      })
    );
  }
  return jwksPromise;
};

const resetJwksCache = () => {
  jwksPromise = null;
  cachedIssuer = null;
};

const verifySupabaseToken = async (token) => {
  if (!token || typeof token !== 'string') throw new Error('Missing access token.');
  const [{ jwtVerify }, jwks] = await Promise.all([getJose(), getJwks()]);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${supabaseOrigin()}/auth/v1`,
    audience: 'authenticated',
    algorithms: ['ES256'],
  });
  if (!payload.sub) throw new Error('Token has no subject.');
  return payload;
};

// Non-throwing variant for non-security-critical keying (rate limits).
const subjectFromToken = async (token) => {
  try {
    const payload = await verifySupabaseToken(token);
    return payload.sub;
  } catch {
    return null;
  }
};

module.exports = { verifySupabaseToken, subjectFromToken, resetJwksCache };

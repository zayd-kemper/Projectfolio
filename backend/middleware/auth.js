// Authenticates requests with Supabase Auth access tokens.
//
// Supabase owns sessions, refresh, and revocation, so there is no tokenVersion
// freshness check any more — a revoked session simply stops producing valid
// access tokens. Profile fields beyond id/email are read from public.users
// rather than trusted from the token's user_metadata.

const { verifySupabaseToken } = require('../utils/supabaseJwt');
const { loadAuthProfile } = require('../utils/authProfile');

const bearerFrom = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
};

const resolveUser = async (req) => {
  const token = bearerFrom(req);
  if (!token) return null;
  const payload = await verifySupabaseToken(token);
  const profile = await loadAuthProfile(payload.sub);
  if (!profile) {
    const error = new Error('No profile for this identity.');
    error.code = 'PROFILE_MISSING';
    throw error;
  }
  return {
    id: profile.id,
    email: profile.email || payload.email || null,
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url || null,
  };
};

const requireAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: 'No valid access token provided.', code: 'AUTH_REQUIRED' });
    req.user = user;
    return next();
  } catch (error) {
    const message = error.code === 'ERR_JWT_EXPIRED'
      ? 'Access token expired.'
      : error.code === 'PROFILE_MISSING'
        ? 'Your account is still being set up. Please try again in a moment.'
        : 'Invalid access token.';
    return res.status(401).json({ error: message, code: 'AUTH_REQUIRED' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
  } catch { /* anonymous access is fine here */ }
  next();
};

module.exports = { requireAuth, optionalAuth };

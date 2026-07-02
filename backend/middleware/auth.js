const jwt = require('jsonwebtoken');
const { getTokenVersion } = require('../utils/authTokenVersion');

const userFromToken = (decoded) => ({
  id: decoded.userId,
  email: decoded.email,
  username: decoded.username,
  full_name: decoded.full_name,
  avatar_url: decoded.avatar_url || null,
  token_version: Number(decoded.tokenVersion || 0),
});

const decodeRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return jwt.verify(authHeader.slice('Bearer '.length), process.env.JWT_SECRET);
};

const assertFreshToken = async (decoded) => {
  const currentVersion = await getTokenVersion(decoded.userId);
  if (currentVersion === null || Number(decoded.tokenVersion || 0) !== currentVersion) {
    const error = new Error('Stale access token.');
    error.code = 'STALE_TOKEN';
    throw error;
  }
};

const requireAuth = async (req, res, next) => {
  try {
    const decoded = decodeRequest(req);
    if (!decoded?.userId) return res.status(401).json({ error: 'No valid access token provided.' });
    await assertFreshToken(decoded);
    req.user = userFromToken(decoded);
    return next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError'
      ? 'Access token expired.'
      : error.code === 'STALE_TOKEN'
        ? 'Session expired. Please sign in again.'
        : 'Invalid access token.';
    return res.status(401).json({ error: message, code: 'AUTH_REQUIRED' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const decoded = decodeRequest(req);
    if (decoded?.userId) {
      await assertFreshToken(decoded);
      req.user = userFromToken(decoded);
    }
  } catch {}
  next();
};

module.exports = { requireAuth, optionalAuth };

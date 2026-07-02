const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, pool } = require('../config/database');
const { setTokenVersion } = require('./authTokenVersion');

const REFRESH_COOKIE = 'pf_refresh';
const refreshDays = Math.max(1, Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 30);

const accessClaims = (user) => ({
  userId: user.id,
  email: user.email,
  username: user.username,
  full_name: user.full_name,
  avatar_url: user.avatar_url || null,
  tokenVersion: Number(user.token_version || 0),
});

const generateAccessToken = (user) => jwt.sign(accessClaims(user), process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest();
const createOpaqueToken = () => crypto.randomBytes(48).toString('base64url');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: refreshDays * 24 * 60 * 60 * 1000,
});

const issueAuthTokens = async (res, user, familyId = crypto.randomUUID()) => {
  const refreshToken = createOpaqueToken();
  await query({
    name: 'auth-refresh-insert',
    text: `INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at)
           VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 day'))`,
    values: [user.id, hashToken(refreshToken), familyId, refreshDays],
  });
  await setTokenVersion(user.id, user.token_version || 0);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  return generateAccessToken(user);
};

const rotateRefreshToken = async (res, rawToken) => {
  if (!rawToken) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
              u.email, u.username, u.full_name, u.avatar_url, u.token_version
       FROM auth_refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 FOR UPDATE`,
      [hashToken(rawToken)]
    );
    if (!current.rows[0] || current.rows[0].revoked_at || new Date(current.rows[0].expires_at) <= new Date()) {
      if (current.rows[0]?.family_id) {
        await client.query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1', [current.rows[0].family_id]);
      }
      await client.query('COMMIT');
      return null;
    }

    const row = current.rows[0];
    const nextRaw = createOpaqueToken();
    const next = await client.query(
      `INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 day')) RETURNING id`,
      [row.user_id, hashToken(nextRaw), row.family_id, refreshDays]
    );
    await client.query('UPDATE auth_refresh_tokens SET revoked_at = NOW(), replaced_by = $1 WHERE id = $2', [next.rows[0].id, row.id]);
    await client.query('COMMIT');
    res.cookie(REFRESH_COOKIE, nextRaw, cookieOptions());
    return generateAccessToken({ ...row, id: row.user_id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const revokeRefreshToken = async (res, rawToken) => {
  if (rawToken) {
    await query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1', [hashToken(rawToken)]);
  }
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOptions);
};

module.exports = {
  REFRESH_COOKIE,
  generateAccessToken,
  issueAuthTokens,
  rotateRefreshToken,
  revokeRefreshToken,
};

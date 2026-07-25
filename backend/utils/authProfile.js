// Resolves the caller's profile row for req.user.
//
// Supabase owns identity; public.users owns the profile. Routes read
// req.user.full_name / req.user.username, and those must come from the profile
// table rather than the JWT's user_metadata snapshot, which goes stale as soon as
// someone edits their profile (and never carries `username` at all).
//
// Cached in Redis for 60s, mirroring the utils/authTokenVersion.js pattern this
// module replaces — no new infrastructure, no net extra per-request DB traffic.

const { query } = require('../config/database');
const { getRedis } = require('../config/redis');

const TTL_SECONDS = 60;
const keyFor = (userId) => `auth:profile:${userId}`;

const loadAuthProfile = async (userId) => {
  const redis = getRedis();

  if (redis) {
    const cached = await redis.get(keyFor(userId)).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through to the db */ }
    }
  }

  const result = await query(
    'SELECT id, email, username, full_name, avatar_url FROM users WHERE id = $1',
    [userId]
  );
  const profile = result.rows[0] || null;

  if (redis && profile) {
    await redis.set(keyFor(userId), JSON.stringify(profile), 'EX', TTL_SECONDS).catch(() => {});
  }
  return profile;
};

const invalidateAuthProfile = async (userId) => {
  const redis = getRedis();
  if (redis && userId) await redis.del(keyFor(userId)).catch(() => {});
};

module.exports = { loadAuthProfile, invalidateAuthProfile };

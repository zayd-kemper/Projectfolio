const { query } = require('../config/database');
const { getRedis } = require('../config/redis');

const keyFor = (userId) => `auth:token-version:${userId}`;

const getTokenVersion = async (userId) => {
  const redis = getRedis();
  if (redis) {
    const cached = await redis.get(keyFor(userId)).catch(() => null);
    if (cached !== null) return Number(cached) || 0;
  }
  const result = await query('SELECT token_version FROM users WHERE id = $1', [userId]);
  if (!result.rows[0]) return null;
  const version = Number(result.rows[0].token_version || 0);
  if (redis) await redis.set(keyFor(userId), String(version), 'EX', 300).catch(() => {});
  return version;
};

const setTokenVersion = async (userId, version) => {
  const redis = getRedis();
  if (redis) await redis.set(keyFor(userId), String(Number(version) || 0), 'EX', 300).catch(() => {});
};

module.exports = { getTokenVersion, setTokenVersion };

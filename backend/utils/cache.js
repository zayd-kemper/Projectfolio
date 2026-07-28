const { getRedis } = require('../config/redis');

const defaultTtl = Math.max(5, Number(process.env.PUBLIC_CACHE_TTL_SECONDS) || 60);

const getJson = async (key) => {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
};

const setJson = async (key, value, ttlSeconds = defaultTtl) => {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
};

const getOrSet = async (key, loader, ttlSeconds = defaultTtl) => {
  const cached = await getJson(key).catch(() => null);
  if (cached !== null) return { value: cached, cacheHit: true };
  const value = await loader();
  await setJson(key, value, ttlSeconds).catch(() => {});
  return { value, cacheHit: false };
};

const invalidate = async (...keys) => {
  const redis = getRedis();
  if (redis && keys.length) await redis.del(...keys);
};

const invalidatePattern = async (pattern) => {
  const redis = getRedis();
  if (!redis) return;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== '0');
};

// Owner-scoped invalidation. A pattern like 'public:*' evicts every user's cached
// pages because one person edited one project, so callers that know whose content
// changed should say so. A falsy argument keeps the old global behaviour for the
// few call sites that genuinely cannot name an owner.

const invalidatePortfolio = async (username) => {
  if (!username) return invalidatePattern('public:portfolio:*');
  return invalidate(`public:portfolio:${username}`);
};

const invalidateProjects = async (username) => {
  if (!username) return invalidatePattern('public:project:*');
  return invalidatePattern(`public:project:${username}:*`);
};

const invalidatePublicUser = async (username) => {
  // Cache failures must never fail a write. Every current caller wraps this in its
  // own .catch too, but the guarantee belongs here so a future caller cannot forget it.
  await Promise.all([invalidatePortfolio(username), invalidateProjects(username)]).catch(() => {});
};

const invalidateTeam = async (slug) => {
  if (!slug) return invalidatePattern('public:team:*');
  return invalidate(`public:team:${slug}`);
};

module.exports = {
  getJson,
  setJson,
  getOrSet,
  invalidate,
  invalidatePattern,
  invalidatePortfolio,
  invalidateProjects,
  invalidatePublicUser,
  invalidateTeam,
};

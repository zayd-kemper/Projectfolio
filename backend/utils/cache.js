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

module.exports = { getJson, setJson, getOrSet, invalidate, invalidatePattern };

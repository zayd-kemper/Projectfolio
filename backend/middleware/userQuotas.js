const { getRedis } = require('../config/redis');

const counters = new Map();
const concurrent = new Map();

const userKey = (req) => req.user?.id || req.ip || 'anonymous';

const cleanupCounter = (key, now) => {
  const current = counters.get(key);
  if (current && current.resetAt <= now) counters.delete(key);
};

const userQuota = (name, options = {}) => {
  const windowMs = Math.max(1000, Number(options.windowMs) || 60_000);
  const max = Math.max(1, Number(options.max) || 60);
  const message = options.message || 'Rate limit exceeded. Please wait and try again.';

  return async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `quota:${name}:user:${userKey(req)}:${bucket}`;
    const redis = getRedis();
    try {
      if (redis) {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000) + 5);
        if (count > max) return res.status(429).json({ error: message, code: 'USER_QUOTA_EXCEEDED' });
        return next();
      }
    } catch (error) {
      req.log?.warn?.({ err: error, quota: name }, 'Redis quota check failed; using memory fallback');
    }

    const now = Date.now();
    cleanupCounter(key, now);
    const current = counters.get(key) || { count: 0, resetAt: now + windowMs };
    current.count += 1;
    counters.set(key, current);
    if (current.count > max) return res.status(429).json({ error: message, code: 'USER_QUOTA_EXCEEDED' });
    return next();
  };
};

const userCostBudget = (name, options = {}) => {
  const windowMs = Math.max(1000, Number(options.windowMs) || 60 * 60 * 1000);
  const maxCost = Math.max(1, Number(options.maxCost) || 100);
  const cost = Math.max(1, Number(options.cost) || 1);
  const message = options.message || 'Usage budget exceeded. Please wait and try again.';

  return async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `quota:${name}:cost:user:${userKey(req)}:${bucket}`;
    const redis = getRedis();
    try {
      if (redis) {
        const total = await redis.incrby(key, cost);
        if (total === cost) await redis.expire(key, Math.ceil(windowMs / 1000) + 5);
        if (total > maxCost) return res.status(429).json({ error: message, code: 'USER_COST_BUDGET_EXCEEDED' });
        return next();
      }
    } catch (error) {
      req.log?.warn?.({ err: error, quota: name }, 'Redis cost budget check failed; using memory fallback');
    }

    const now = Date.now();
    cleanupCounter(key, now);
    const current = counters.get(key) || { count: 0, resetAt: now + windowMs };
    current.count += cost;
    counters.set(key, current);
    if (current.count > maxCost) return res.status(429).json({ error: message, code: 'USER_COST_BUDGET_EXCEEDED' });
    return next();
  };
};

const userConcurrency = (name, options = {}) => {
  const max = Math.max(1, Number(options.max) || 2);
  const ttlMs = Math.max(5000, Number(options.ttlMs) || 120_000);
  const message = options.message || 'Too many concurrent requests. Please wait and try again.';

  return async (req, res, next) => {
    const key = `quota:${name}:concurrent:user:${userKey(req)}`;
    const redis = getRedis();
    let release = async () => {};

    try {
      if (redis) {
        const count = await redis.incr(key);
        await redis.pexpire(key, ttlMs);
        if (count > max) {
          await redis.decr(key);
          return res.status(429).json({ error: message, code: 'USER_CONCURRENCY_EXCEEDED' });
        }
        release = async () => { await redis.decr(key).catch(() => {}); };
      } else {
        const count = (concurrent.get(key) || 0) + 1;
        if (count > max) return res.status(429).json({ error: message, code: 'USER_CONCURRENCY_EXCEEDED' });
        concurrent.set(key, count);
        const timer = setTimeout(() => {
          concurrent.set(key, Math.max(0, (concurrent.get(key) || 1) - 1));
          if (concurrent.get(key) === 0) concurrent.delete(key);
        }, ttlMs);
        release = async () => {
          clearTimeout(timer);
          concurrent.set(key, Math.max(0, (concurrent.get(key) || 1) - 1));
          if (concurrent.get(key) === 0) concurrent.delete(key);
        };
      }
    } catch (error) {
      req.log?.warn?.({ err: error, quota: name }, 'Concurrency quota check failed open');
      return next();
    }

    let released = false;
    const once = () => {
      if (released) return;
      released = true;
      release();
    };
    res.on('finish', once);
    res.on('close', once);
    return next();
  };
};

module.exports = { userQuota, userCostBudget, userConcurrency };

const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL;
let redis = null;

const buildRedis = (connectionName = 'projectfolio') => {
  if (!redisUrl) return null;
  const client = new Redis(redisUrl, {
    connectionName,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  });
  client.on('error', (error) => logger.warn({ err: error, connectionName }, 'Redis connection error'));
  return client;
};

const getRedis = () => {
  if (!redis) redis = buildRedis('projectfolio-api');
  return redis;
};

const connectRedis = async () => {
  const client = getRedis();
  if (client?.status === 'wait') await client.connect();
  else if (client && client.status !== 'ready') {
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
    });
  }
  return client;
};

const closeRedis = async () => {
  if (!redis) return;
  await redis.quit().catch(() => redis.disconnect());
  redis = null;
};

module.exports = { buildRedis, getRedis, connectRedis, closeRedis, redisEnabled: Boolean(redisUrl) };

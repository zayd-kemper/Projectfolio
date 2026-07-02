const { Queue } = require('bullmq');
const { query } = require('../config/database');
const { buildRedis, redisEnabled } = require('../config/redis');
const { processByType } = require('./processors');
const { jobCounter, jobDuration } = require('../config/metrics');
const logger = require('../utils/logger');

const QUEUE_NAME = process.env.JOB_QUEUE_NAME || 'projectfolio-jobs';
let queue;

const getQueue = () => {
  if (!redisEnabled) return null;
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: buildRedis('projectfolio-job-producer') });
  return queue;
};

const executeJob = async (jobId, type, input, updateProgress = async () => {}) => {
  const started = process.hrtime.bigint();
  await query('UPDATE background_jobs SET status = $1, started_at = NOW(), attempts = attempts + 1 WHERE id = $2', ['active', jobId]);
  try {
    await updateProgress(5);
    const result = await processByType(type, input, { jobId, updateProgress });
    await updateProgress(100);
    await query(
      `UPDATE background_jobs SET status = 'completed', progress = 100, result = $1, completed_at = NOW(),
       expires_at = NOW() + ($3 * INTERVAL '1 day') WHERE id = $2`,
      [JSON.stringify(result ?? null), jobId, Math.max(1, Number(process.env.JOB_RESULT_TTL_DAYS) || 7)]
    );
    jobCounter.inc({ type, status: 'completed' });
    jobDuration.observe({ type, status: 'completed' }, Number(process.hrtime.bigint() - started) / 1e9);
    return result;
  } catch (error) {
    await query("UPDATE background_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2", [String(error.message || error), jobId]);
    jobCounter.inc({ type, status: 'failed' });
    jobDuration.observe({ type, status: 'failed' }, Number(process.hrtime.bigint() - started) / 1e9);
    logger.error({ err: error, jobId, type }, 'Background job failed');
    throw error;
  }
};

const createJob = async ({ userId = null, type, input = {}, idempotencyKey = null }) => {
  const created = await query(
    `INSERT INTO background_jobs (user_id, type, input, idempotency_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, type, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING id, status, progress, created_at, (xmax = 0) AS inserted`,
    [userId, type, JSON.stringify(input), idempotencyKey]
  );
  const job = created.rows[0];
  const bullQueue = getQueue();
  if (bullQueue && job.inserted) {
    await bullQueue.add(type, { databaseJobId: job.id, type, input }, {
      jobId: job.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
  } else if (!bullQueue && job.inserted && job.status === 'queued') {
    setImmediate(() => executeJob(job.id, type, input).catch(() => {}));
  }
  return job;
};

const closeQueue = async () => {
  if (queue) await queue.close();
  queue = null;
};

module.exports = { QUEUE_NAME, createJob, executeJob, closeQueue };

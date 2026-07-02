process.env.PROCESS_ROLE = 'worker';
require('dotenv').config();

const { Worker } = require('bullmq');
const { buildRedis, redisEnabled } = require('./config/redis');
const { closePool } = require('./config/database');
const { QUEUE_NAME, executeJob } = require('./jobs/service');
const logger = require('./utils/logger');
const { closeBrowser } = require('./utils/browserPool');
const { query } = require('./config/database');

if (!redisEnabled) {
  logger.fatal('REDIS_URL is required for the standalone worker process');
  process.exit(1);
}

const worker = new Worker(QUEUE_NAME, async (job) => executeJob(
  job.data.databaseJobId,
  job.data.type,
  job.data.input,
  (progress) => job.updateProgress(progress)
), {
  connection: buildRedis('projectfolio-worker'),
  concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 4),
});

const ensureFutureAnalyticsPartition = async () => {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() + 13);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const suffix = `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  const date = (value) => value.toISOString().slice(0, 10);
  await query(
    `CREATE TABLE IF NOT EXISTS analytics_events_${suffix}
     PARTITION OF analytics_events FOR VALUES FROM ('${date(start)}') TO ('${date(end)}')`
  );
};

const runMaintenance = async () => {
  const retentionDays = Math.max(1, Number(process.env.REVISION_RETENTION_DAYS) || 90);
  try {
    await query(
      `UPDATE ai_change_sets
       SET before_revision_id = NULL,
           after_revision_id = NULL,
           preview = COALESCE(preview, '{}'::jsonb) - 'rollbackSnapshot' - 'afterSnapshot'
       WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
         AND (before_revision_id IS NOT NULL OR after_revision_id IS NOT NULL)`,
      [retentionDays]
    );
    await query('DELETE FROM portfolio_revisions WHERE expires_at < NOW()');
    await Promise.all([
      query('DELETE FROM background_jobs WHERE expires_at < NOW()'),
      query("UPDATE post_stats SET trending_score = (like_count * 3 + comment_count * 2) * GREATEST(0.1, 1 - EXTRACT(EPOCH FROM (NOW() - updated_at)) / 604800), updated_at = NOW()"),
      query("UPDATE user_stats SET recent_views = 0, trending_score = follower_count * 5 + project_count * 2, updated_at = NOW() WHERE updated_at < NOW() - INTERVAL '7 days'"),
      ensureFutureAnalyticsPartition(),
    ]);
  } catch (error) {
    logger.error({ err: error }, 'Worker maintenance failed');
  }
};

runMaintenance();
const maintenanceTimer = setInterval(
  runMaintenance,
  Math.max(60_000, Number(process.env.MAINTENANCE_INTERVAL_MS) || 60 * 60 * 1000)
);
maintenanceTimer.unref();

worker.on('completed', (job) => logger.info({ jobId: job.id, type: job.name }, 'Job completed'));
worker.on('failed', (job, error) => logger.error({ err: error, jobId: job?.id, type: job?.name }, 'Job failed'));

const shutdown = async () => {
  clearInterval(maintenanceTimer);
  await worker.close();
  await Promise.allSettled([closeBrowser(), closePool()]);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

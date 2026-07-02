const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'projectfolio_' });

const httpDuration = new client.Histogram({
  name: 'projectfolio_http_request_duration_seconds',
  help: 'HTTP request latency by route and status.',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15],
  registers: [register],
});

const dbDuration = new client.Histogram({
  name: 'projectfolio_db_query_duration_seconds',
  help: 'PostgreSQL query latency by stable query name.',
  labelNames: ['query', 'status'],
  buckets: [0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5],
  registers: [register],
});

const dbPool = new client.Gauge({
  name: 'projectfolio_db_pool_connections',
  help: 'PostgreSQL pool state.',
  labelNames: ['state'],
  registers: [register],
});

const jobCounter = new client.Counter({
  name: 'projectfolio_jobs_total',
  help: 'Background jobs by type and final state.',
  labelNames: ['type', 'status'],
  registers: [register],
});

const jobDuration = new client.Histogram({
  name: 'projectfolio_job_duration_seconds',
  help: 'Background job processing latency.',
  labelNames: ['type', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30, 60, 180, 300],
  registers: [register],
});

const observePool = (pool) => {
  dbPool.set({ state: 'total' }, pool.totalCount || 0);
  dbPool.set({ state: 'idle' }, pool.idleCount || 0);
  dbPool.set({ state: 'waiting' }, pool.waitingCount || 0);
};

module.exports = {
  register,
  httpDuration,
  dbDuration,
  jobCounter,
  jobDuration,
  observePool,
};

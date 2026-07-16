// backend/config/database.js
// This file manages the connection to your PostgreSQL database

const { Pool, types } = require('pg');
const logger = require('../utils/logger');

// DATE columns round-trip as plain YYYY-MM-DD strings. The default parser
// returns a timezone-shifted JS Date that res.json() serializes as a full ISO
// timestamp, which fails s.date() validation when clients echo it back.
types.setTypeParser(types.builtins.DATE, (value) => value);
const { dbDuration, observePool } = require('./metrics');
require('dotenv').config();

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const workerRole = process.env.PROCESS_ROLE === 'worker';
const poolMax = asPositiveInt(
  workerRole ? process.env.DB_POOL_MAX_WORKER : process.env.DB_POOL_MAX_WEB,
  workerRole ? 4 : 8
);
const statementTimeout = asPositiveInt(
  workerRole ? process.env.DB_STATEMENT_TIMEOUT_WORKER_MS : process.env.DB_STATEMENT_TIMEOUT_WEB_MS,
  workerRole ? 30000 : 5000
);

const baseConfig = {
  max: poolMax,
  min: 0,
  idleTimeoutMillis: asPositiveInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: asPositiveInt(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  statement_timeout: statementTimeout,
  query_timeout: statementTimeout + 1000,
  idle_in_transaction_session_timeout: asPositiveInt(process.env.DB_IDLE_TRANSACTION_TIMEOUT_MS, 10000),
  application_name: process.env.DB_APPLICATION_NAME || `projectfolio-${workerRole ? 'worker' : 'web'}`,
  keepAlive: true,
};

const pool = new Pool(process.env.DATABASE_URL
  ? {
      ...baseConfig,
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      ...baseConfig,
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'projectfolio',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

// Test the connection when the server starts
pool.on('connect', () => logger.debug({ poolMax }, 'PostgreSQL connection opened'));

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

const normalizeQuery = (statement, params) => {
  if (typeof statement === 'string') {
    return { pgConfig: { text: statement, values: params }, metricName: 'unnamed' };
  }
  const pgConfig = { ...statement, values: statement.values || params };
  if (!statement.name) delete pgConfig.name;
  return { pgConfig, metricName: statement.name || 'unnamed' };
};

const query = async (statement, params) => {
  const { pgConfig, metricName } = normalizeQuery(statement, params);
  const startedAt = process.hrtime.bigint();
  try {
    const result = await pool.query(pgConfig);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    dbDuration.observe({ query: metricName, status: 'ok' }, durationMs / 1000);
    observePool(pool);
    if (durationMs >= asPositiveInt(process.env.DB_SLOW_QUERY_MS, 200)) {
      logger.warn({ query: metricName, durationMs: Math.round(durationMs), rows: result.rowCount }, 'Slow database query');
    }
    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    dbDuration.observe({ query: metricName, status: 'error' }, durationMs / 1000);
    observePool(pool);
    logger.error({ err: error, query: metricName, durationMs: Math.round(durationMs) }, 'Database query failed');
    throw error;
  }
};

const closePool = () => pool.end();

module.exports = { pool, query, closePool };

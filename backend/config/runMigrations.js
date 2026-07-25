const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('./database');
const logger = require('../utils/logger');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const lockKey = 'projectfolio_schema_migrations_v1';

// Hash on normalized line endings so a CRLF/LF flip (e.g. git autocrlf) doesn't
// read as a changed migration.
const migrationChecksum = (sql) =>
  crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

const runNonTransactionalMigration = async (client, sql, filename) => {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^--\s*no-transaction\s*$/i.test(statement));

  for (const statement of statements) {
    try {
      await client.query(statement);
    } catch (error) {
      if (error.code !== '42501') throw error;
      const statementHash = crypto.createHash('sha256').update(statement).digest('hex');
      await client.query(
        `INSERT INTO schema_migration_warnings (filename, statement_hash, warning)
         VALUES ($1, $2, $3) ON CONFLICT (filename, statement_hash) DO UPDATE SET warning = EXCLUDED.warning`,
        [filename, statementHash, error.message]
      );
      logger.warn({ migration: filename, statementHash, err: error.message }, 'Migration statement skipped for insufficient ownership');
    }
  }
};

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration_warnings (
        filename TEXT NOT NULL,
        statement_hash TEXT NOT NULL,
        warning TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(filename, statement_hash)
      )
    `);

    const appliedResult = await client.query('SELECT filename, checksum FROM schema_migrations');
    const applied = new Map(appliedResult.rows.map((row) => [row.filename, row.checksum]));
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();

    for (const filename of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      const checksum = migrationChecksum(sql);
      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) throw new Error(`Applied migration changed: ${filename}`);
        continue;
      }

      const transactional = !/^\s*--\s*no-transaction/im.test(sql);
      if (transactional) await client.query('BEGIN');
      try {
        if (transactional) await client.query(sql);
        else await runNonTransactionalMigration(client, sql, filename);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [filename, checksum]);
        if (transactional) await client.query('COMMIT');
        logger.info({ migration: filename }, 'Migration applied');
      } catch (error) {
        if (transactional) await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => {});
    client.release();
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (error) => {
      logger.error({ err: error }, 'Migration failed');
      await pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { runMigrations, migrationChecksum };

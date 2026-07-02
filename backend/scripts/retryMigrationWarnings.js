require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error('MIGRATION_DATABASE_URL is required and must use the database-owner role.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1,
});

const migrationsDir = path.join(__dirname, '..', 'migrations');

const statementsFor = (filename) => fs
  .readFileSync(path.join(migrationsDir, filename), 'utf8')
  .split(';')
  .map((statement) => statement.trim())
  .filter((statement) => statement && !/^--\s*no-transaction\s*$/i.test(statement));

const run = async () => {
  const client = await pool.connect();
  let failed = 0;
  try {
    const result = await client.query(
      'SELECT filename, statement_hash FROM schema_migration_warnings ORDER BY filename, created_at'
    );
    if (result.rowCount === 0) {
      console.log('No migration warnings to retry.');
      return;
    }

    const warnings = new Set(result.rows.map((row) => `${row.filename}:${row.statement_hash}`));
    for (const filename of [...new Set(result.rows.map((row) => row.filename))]) {
      const filePath = path.join(migrationsDir, filename);
      if (!fs.existsSync(filePath)) {
        console.error(`Missing migration file: ${filename}`);
        failed += 1;
        continue;
      }

      for (const statement of statementsFor(filename)) {
        const hash = crypto.createHash('sha256').update(statement).digest('hex');
        if (!warnings.has(`${filename}:${hash}`)) continue;
        try {
          await client.query(statement);
          await client.query(
            'DELETE FROM schema_migration_warnings WHERE filename = $1 AND statement_hash = $2',
            [filename, hash]
          );
          console.log(`Resolved ${filename}:${hash.slice(0, 12)}`);
        } catch (error) {
          failed += 1;
          console.error(`Failed ${filename}:${hash.slice(0, 12)} - ${error.message}`);
        }
      }
    }
  } finally {
    client.release();
  }

  if (failed > 0) process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

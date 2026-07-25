const test = require('node:test');
const assert = require('node:assert/strict');
const { migrationChecksum } = require('../config/runMigrations');

test('migrationChecksum is identical for CRLF and LF line endings', () => {
  const crlf = migrationChecksum('CREATE TABLE x (id int);\r\nINSERT INTO x VALUES (1);\r\n');
  const lf = migrationChecksum('CREATE TABLE x (id int);\nINSERT INTO x VALUES (1);\n');
  assert.equal(crlf, lf, 'line endings must not change a migration checksum');
});

// Postgres DATE columns must round-trip as plain YYYY-MM-DD strings.
// pg's default parser turns DATE into a JS Date, which res.json() serializes
// as a full ISO timestamp ("2018-04-18T00:00:00.000Z") — that echoes back into
// PUT /api/projects/:id and fails the s.date() rule (max 10 chars, YYYY-MM-DD).
const { test } = require('node:test');
const assert = require('node:assert');

test('DATE columns are parsed as YYYY-MM-DD strings, not Date objects', () => {
  require('../config/database');
  const { types } = require('pg');
  const parsed = types.getTypeParser(types.builtins.DATE)('2018-04-18');
  assert.strictEqual(parsed, '2018-04-18');
});

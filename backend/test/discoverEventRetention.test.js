const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let queries = [];
let rowCounts = [];

Module._load = function (request, parent, isMain) {
  if (request === '../config/database') {
    return {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rowCount: rowCounts.length ? rowCounts.shift() : 0, rows: [] };
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  pruneDiscoverEvents,
  resolveRetentionDays,
  MINIMUM_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  BATCH_SIZE,
  MAX_BATCHES,
} = require('../utils/discoverEventRetention');
Module._load = originalLoad;

test.beforeEach(() => {
  queries = [];
  rowCounts = [];
  delete process.env.DISCOVER_EVENT_RETENTION_DAYS;
});

test('retention defaults to 30 days when unset', () => {
  assert.equal(resolveRetentionDays(undefined), DEFAULT_RETENTION_DAYS);
  assert.equal(resolveRetentionDays(''), DEFAULT_RETENTION_DAYS);
});

test('retention never drops below the 14-day scoring lookback', () => {
  assert.equal(resolveRetentionDays('5'), MINIMUM_RETENTION_DAYS);
  assert.equal(resolveRetentionDays('1'), MINIMUM_RETENTION_DAYS);
  assert.equal(resolveRetentionDays('-3'), DEFAULT_RETENTION_DAYS);
});

test('retention honours a larger configured value', () => {
  assert.equal(resolveRetentionDays('90'), 90);
});

test('pruning stops once a batch comes back short', async () => {
  rowCounts = [BATCH_SIZE, 12];
  const deleted = await pruneDiscoverEvents();
  assert.equal(deleted, BATCH_SIZE + 12);
  assert.equal(queries.length, 2);
});

test('pruning is capped so one cycle cannot run unbounded', async () => {
  rowCounts = new Array(MAX_BATCHES + 5).fill(BATCH_SIZE);
  await pruneDiscoverEvents();
  assert.equal(queries.length, MAX_BATCHES);
});

test('pruning passes the resolved retention window to the query', async () => {
  rowCounts = [0];
  await pruneDiscoverEvents();
  assert.equal(queries[0].params[0], DEFAULT_RETENTION_DAYS);
  assert.equal(queries[0].params[1], BATCH_SIZE);
  assert.match(queries[0].sql, /DELETE FROM discover_events/);
});

test('the batch subquery does not ORDER BY — any expired rows are equally valid to delete, and sorting forces a full scan', async () => {
  rowCounts = [0];
  await pruneDiscoverEvents();
  assert.doesNotMatch(queries[0].sql, /ORDER BY/);
});

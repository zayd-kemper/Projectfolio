// Discover impression events accumulate on every card view and were previously
// never removed — the table is not partitioned the way analytics_events is.
//
// The recommendation scoring in routes/discover.js looks back 14 days. Retention
// shorter than that would quietly degrade recommendations instead of failing, so
// the floor below is a correctness guard rather than a convenience default.

const { query } = require('../config/database');

const MINIMUM_RETENTION_DAYS = 15;
const DEFAULT_RETENTION_DAYS = 30;
const BATCH_SIZE = 5000;
const MAX_BATCHES = 20;

const resolveRetentionDays = (raw = process.env.DISCOVER_EVENT_RETENTION_DAYS) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.max(MINIMUM_RETENTION_DAYS, Math.floor(parsed));
};

// Deleted in bounded batches so the statement cannot hold a long lock once the
// table is large, and capped so one maintenance cycle cannot run away.
const pruneDiscoverEvents = async () => {
  const days = resolveRetentionDays();
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const result = await query(
      `DELETE FROM discover_events
       WHERE id IN (
         SELECT id FROM discover_events
         WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
         ORDER BY created_at
         LIMIT $2
       )`,
      [days, BATCH_SIZE]
    );
    const removed = result.rowCount || 0;
    deleted += removed;
    if (removed < BATCH_SIZE) break;
  }
  return deleted;
};

module.exports = {
  pruneDiscoverEvents,
  resolveRetentionDays,
  MINIMUM_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  BATCH_SIZE,
  MAX_BATCHES,
};

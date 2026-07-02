const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { userQuota } = require('../middleware/userQuotas');

const router = express.Router();

// ── GET NOTIFICATIONS ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    let cursorDate = null;
    let cursorId = null;
    if (req.query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
        cursorDate = decoded.created_at;
        cursorId = decoded.id;
      } catch { return res.status(400).json({ error: 'Invalid cursor.' }); }
    }
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1
       AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
       ORDER BY created_at DESC, id DESC LIMIT $4`,
      [req.user.id, cursorDate, cursorId, limit + 1]
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const unread = await query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false', [req.user.id]);
    const last = rows.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64url') : null;
    res.json({ notifications: rows, unread_count: unread.rows[0].count, next_cursor: nextCursor, has_more: hasMore });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get notifications.' });
  }
});

// ── MARK ALL READ ─────────────────────────────────────────────────────────────
router.put('/read-all', requireAuth, userQuota('notifications.read-all', { windowMs: 60 * 60 * 1000, max: 120 }), async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notifications.' });
  }
});

// ── MARK SINGLE READ ──────────────────────────────────────────────────────────
router.put('/:id/read', requireAuth, userQuota('notifications.read', { windowMs: 60 * 60 * 1000, max: 600 }), async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification.' });
  }
});

// ── DELETE NOTIFICATION ───────────────────────────────────────────────────────
router.delete('/:id', requireAuth, userQuota('notifications.delete', { windowMs: 60 * 60 * 1000, max: 300 }), async (req, res) => {
  try {
    await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

module.exports = router;

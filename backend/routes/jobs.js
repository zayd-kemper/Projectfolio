const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { userConcurrency, userQuota } = require('../middleware/userQuotas');

const router = express.Router();

const loadJob = async (id, userId) => {
  const result = await query(
    `SELECT id, type, status, progress, result, error, created_at, started_at, completed_at
     FROM background_jobs WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
};

router.get('/:id', requireAuth, async (req, res) => {
  const job = await loadJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json({ job });
});

router.get(
  '/:id/events',
  requireAuth,
  userQuota('jobs.events', { windowMs: 60 * 1000, max: 30, message: 'Too many job stream requests. Please wait and try again.' }),
  userConcurrency('jobs.events', { max: 4, ttlMs: 11 * 60 * 1000, message: 'Too many open job streams.' }),
  async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });
  for (let count = 0; count < 600 && !closed; count += 1) {
    const job = await loadJob(req.params.id, req.user.id);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Job not found.' })}\n\n`);
      break;
    }
    res.write(`data: ${JSON.stringify(job)}\n\n`);
    if (job.status === 'completed' || job.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  res.end();
});

module.exports = router;

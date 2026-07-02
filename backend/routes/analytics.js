const crypto = require('crypto');
const express = require('express');
const { createJob } = require('../jobs/service');
const { getRedis } = require('../config/redis');
const { userQuota } = require('../middleware/userQuotas');

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sourceFromReferrer = (referrer) => {
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes('google.')) return 'google';
    if (host.includes('linkedin.')) return 'linkedin';
    if (host.includes('github.')) return 'github';
    if (host.includes('tiktok.')) return 'tiktok';
    return 'referral';
  } catch {
    return 'direct';
  }
};

router.post('/view', userQuota('analytics.view', { windowMs: 60 * 1000, max: 120 }), async (req, res) => {
  const { subjectType, subjectId, projectId } = req.body || {};
  if (!['portfolio', 'team'].includes(subjectType) || !uuidPattern.test(subjectId || '') || (projectId && !uuidPattern.test(projectId))) {
    return res.status(400).json({ error: 'Invalid analytics event.' });
  }

  const secret = process.env.ANALYTICS_VISITOR_SECRET || process.env.JWT_SECRET;
  const visitorHash = crypto.createHmac('sha256', secret)
    .update(`${req.ip}|${req.get('user-agent') || ''}`)
    .digest('hex');
  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const dedupeKey = `analytics:dedupe:${subjectType}:${subjectId}:${projectId || 'page'}:${visitorHash}:${bucket}`;
  const redis = getRedis();
  if (redis) {
    const accepted = await redis.set(dedupeKey, '1', 'EX', 31 * 60, 'NX').catch(() => 'OK');
    if (!accepted) return res.status(202).json({ accepted: true, deduplicated: true });
  }

  await createJob({
    type: 'analytics:view',
    input: {
      subjectType,
      subjectId,
      projectId: projectId || null,
      visitorHash,
      source: sourceFromReferrer(req.get('referer')),
      createdAt: new Date().toISOString(),
    },
  });
  return res.status(202).json({ accepted: true });
});

module.exports = router;
